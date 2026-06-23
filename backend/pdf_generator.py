"""
PDF generator — ReportLab.
Supports: plain text, HTML tags (sup/sub/b/i), inline images, OMR sheets.
NEET style: multi-column questions per page with numbered options.
"""
import io, os, re
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image as RLImage
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus.flowables import HRFlowable

PAGE_W, PAGE_H = A4
MARGIN = 1.6 * cm

# ── Styles ────────────────────────────────────────────────────────────────────
def _S():
    ss = getSampleStyleSheet()
    def ps(name, **kw):
        return ParagraphStyle(name, parent=ss['Normal'], **kw)
    return {
        'title':  ps('t',  fontSize=15, alignment=TA_CENTER, fontName='Helvetica-Bold',
                     textColor=colors.HexColor('#1e3a8a'), spaceAfter=4),
        'meta':   ps('m',  fontSize=8,  alignment=TA_CENTER, textColor=colors.grey, spaceAfter=3),
        'secH':   ps('sh', fontSize=10, fontName='Helvetica-Bold', spaceBefore=8, spaceAfter=4,
                     textColor=colors.HexColor('#1d4ed8')),
        'qN':     ps('qn', fontSize=10, fontName='Helvetica-Bold', spaceAfter=2),
        'qT':     ps('qt', fontSize=10, leading=16, spaceAfter=4),
        'opt':    ps('op', fontSize=10, leftIndent=18, leading=15, spaceAfter=2),
        'ans':    ps('an', fontSize=9,  fontName='Helvetica-Bold',
                     textColor=colors.HexColor('#059669'), spaceAfter=2),
        'sol':    ps('sl', fontSize=9,  leading=14, textColor=colors.HexColor('#065f46'),
                     leftIndent=12, spaceAfter=4),
        'footer': ps('ft', fontSize=7,  alignment=TA_CENTER, textColor=colors.grey),
    }

# ── Text preprocessing ─────────────────────────────────────────────────────────
def _prep(text):
    """Convert common notation to ReportLab XML:
       ^{...} -> <super>, _{...} -> <sub>, **bold**, *italic*
       Also keeps HTML <sup><sub><b><i> as-is (ReportLab supports them).
    """
    if not text: return ''
    # Already has HTML tags — ReportLab handles <super>, <sub>, <b>, <i>
    # Convert ^{x} and _{x} notation
    text = re.sub(r'\^\{([^}]+)\}', r'<super>\1</super>', text)
    text = re.sub(r'_\{([^}]+)\}',  r'<sub>\1</sub>', text)
    text = re.sub(r'\^(\w)',   r'<super>\1</super>', text)
    text = re.sub(r'_(\w)',    r'<sub>\1</sub>', text)
    # **bold** and *italic*
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*',     r'<i>\1</i>', text)
    # Convert HTML sup/sub to ReportLab tags
    text = text.replace('<sup>','<super>').replace('</sup>','</super>')
    text = text.replace('<sub>','<sub>').replace('</sub>','</sub>')
    # Escape bare & (not in entities)
    text = re.sub(r'&(?!amp;|lt;|gt;|quot;|apos;|#)', '&amp;', text)
    return text

def _img(path, max_w=14*cm, max_h=7*cm):
    """Load image, scale proportionally."""
    if not path: return None
    candidates = [
        path,
        os.path.join('uploads', path),
        os.path.join('uploads', 'questions', os.path.basename(path)),
        os.path.join('uploads', os.path.basename(path)),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                im = RLImage(p)
                iw, ih = im.imageWidth, im.imageHeight
                if iw and ih:
                    r = min(max_w/iw, max_h/ih, 1.0)
                    im.drawWidth  = iw * r
                    im.drawHeight = ih * r
                return im
            except Exception:
                pass
    return None

def _qtype(q):
    qt = getattr(q,'question_type',None)
    return qt.value if hasattr(qt,'value') else str(qt or 'MCQ_SINGLE')

# ── Main generation ───────────────────────────────────────────────────────────
def generate_question_paper(questions, exam_name, shift_label,
                             include_omr=False, include_solutions=False,
                             neet_style=False):
    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    S    = _S()
    story= []

    # Header
    story.append(Paragraph(_prep(exam_name), S['title']))
    story.append(Paragraph(_prep(shift_label), S['meta']))
    story.append(HRFlowable(width='100%', thickness=2,
                            color=colors.HexColor('#1e3a8a'), spaceAfter=6))

    if questions:
        total_marks = sum(getattr(q,'marks_correct',4) for q in questions)
        dur = 200 if len(questions) >= 180 else 180 if len(questions) >= 75 else 90
        story.append(Paragraph(
            f'Total Questions: {len(questions)}  |  Duration: {dur} minutes  |  Maximum Marks: {int(total_marks)}',
            S['meta']))
        story.append(Paragraph(
            'Marking: Correct +4 | Incorrect -1 | Unattempted 0  (unless stated otherwise)',
            S['meta']))
        story.append(Spacer(1, 8))

    # Group by subject
    from collections import defaultdict, OrderedDict
    by_subj = OrderedDict()
    for q in questions:
        s = q.subject.value if hasattr(q.subject,'value') else str(q.subject)
        by_subj.setdefault(s,[]).append(q)

    for subj, qs in by_subj.items():
        story.append(Paragraph(f'SECTION: {subj}', S['secH']))
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.lightgrey, spaceAfter=4))
        for q in qs:
            story.extend(_q_block(q, S, include_solutions))

    if include_omr:
        story.append(PageBreak())
        story.extend(_omr_pages(questions, S, exam_name, shift_label))

    doc.build(story)
    return buf.getvalue()


def _q_block(q, S, include_solutions):
    """Build one question's flowables."""
    qno  = getattr(q,'question_number','?')
    qtyp = _qtype(q)
    mc   = getattr(q,'marks_correct',4)
    mi   = getattr(q,'marks_incorrect',-1)
    tag  = ''
    if qtyp == 'MCQ_MULTIPLE': tag = '  [Multiple Correct]'
    if qtyp == 'NUMERICAL':    tag = '  [Integer/Numerical]'

    blk = []

    # Question number line
    blk.append(Paragraph(
        f'<b>Q{qno}.{tag}</b>  <font size="8" color="grey">[+{mc} / {mi}]</font>',
        S['qN']))

    # Question text (with markup)
    qt = getattr(q,'question_text','') or ''
    if qt:
        try:
            blk.append(Paragraph(_prep(qt), S['qT']))
        except Exception:
            blk.append(Paragraph(qt.replace('<','[').replace('>',']'), S['qT']))

    # Question image
    qi = getattr(q,'question_image_path',None)
    if qi:
        im = _img(qi)
        if im: blk.append(im)
        else:  blk.append(Paragraph(f'<i>[Image: {os.path.basename(qi)}]</i>', S['meta']))

    # Options
    if qtyp not in ('NUMERICAL','MATRIX_MATCH'):
        opts = [('A', getattr(q,'option_a',None)),
                ('B', getattr(q,'option_b',None)),
                ('C', getattr(q,'option_c',None)),
                ('D', getattr(q,'option_d',None))]
        for k, v in opts:
            if v:
                try:
                    blk.append(Paragraph(f'({k})  {_prep(v)}', S['opt']))
                except Exception:
                    blk.append(Paragraph(f'({k})  {v}', S['opt']))
        oi = getattr(q,'options_image_path',None)
        if oi:
            im = _img(oi, max_h=4*cm)
            if im: blk.append(im)

    # Solution section
    if include_solutions:
        correct = getattr(q,'correct_answer','')
        blk.append(Spacer(1,3))
        blk.append(Paragraph(f'<b>Answer: {correct}</b>', S['ans']))
        st = getattr(q,'solution_text','') or ''
        if st:
            try:
                blk.append(Paragraph(_prep(st), S['sol']))
            except Exception:
                blk.append(Paragraph(st, S['sol']))
        si = getattr(q,'solution_image_path',None)
        if si:
            im = _img(si, max_h=5*cm)
            if im: blk.append(im)

    blk.append(Spacer(1,8))
    return [KeepTogether(blk)]


def _omr_pages(questions, S, exam_name, shift_label):
    story = []
    story.append(Paragraph('OMR ANSWER SHEET', S['title']))
    story.append(Paragraph(f'{exam_name}  |  {shift_label}', S['meta']))
    story.append(Paragraph(
        'Fill bubbles with BLACK/BLUE ballpen only. Do NOT use pencil. '
        'Darken the bubble COMPLETELY. Do NOT make stray marks.', S['meta']))
    story.append(HRFlowable(width='100%',thickness=2,color=colors.HexColor('#1e3a8a'),spaceAfter=10))

    # Student info table
    info = [['Name:', '', 'Roll No.:', ''],
            ['Date:', '', 'Centre:', ''],
            ['Invigilator Sig.:', '', 'Test Code:', '']]
    t = Table(info, colWidths=[3.2*cm, 6.5*cm, 2.8*cm, 5*cm])
    t.setStyle(TableStyle([
        ('FONTSIZE',(0,0),(-1,-1),9), ('FONTNAME',(0,0),(-1,-1),'Helvetica'),
        ('FONTNAME',(0,0),(0,-1),'Helvetica-Bold'), ('FONTNAME',(2,0),(2,-1),'Helvetica-Bold'),
        ('BOX',(1,0),(1,-1),0.5,colors.black), ('BOX',(3,0),(3,-1),0.5,colors.black),
        ('BOTTOMPADDING',(0,0),(-1,-1),8), ('TOPPADDING',(0,0),(-1,-1),4),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,colors.HexColor('#f8f9ff')]),
    ]))
    story.append(t); story.append(Spacer(1,14))

    mcq_qs = [q for q in questions if _qtype(q) in ('MCQ_SINGLE','MCQ_MULTIPLE')]
    num_qs = [q for q in questions if _qtype(q) == 'NUMERICAL']

    if mcq_qs:
        story.append(Paragraph('SECTION A — Multiple Choice Questions', S['secH']))
        story.append(Paragraph('Darken ONE bubble for each question (Multiple Correct: darken all correct options)', S['meta']))
        story.append(Spacer(1,6))

        # Build 2-column grid of bubble rows
        rows = []
        for i in range(0, len(mcq_qs), 2):
            pair = mcq_qs[i:i+2]
            cells = []
            for q in pair:
                qno  = getattr(q,'question_number',i+1)
                is_m = _qtype(q)=='MCQ_MULTIPLE'
                opts_text = '  '.join([f'○{o}' for o in ('A','B','C','D')])
                tag = '  [M]' if is_m else ''
                cells.append(Paragraph(
                    f'<font size="9"><b>Q{qno}.</b></font> '
                    f'<font size="11" color="white">⬤</font>'   # placeholder
                    f'<font size="9">{opts_text}{tag}</font>', S['qN']))
            if len(cells) < 2: cells.append(Paragraph('',S['qN']))
            rows.append(cells)

        # Better: proper bubble table
        story.extend(_bubble_grid(mcq_qs))
        story.append(Spacer(1,14))

    if num_qs:
        story.append(Paragraph('SECTION B — Numerical Value Answers', S['secH']))
        story.append(Paragraph('Write your answer in the digit boxes. Use ± box for sign.', S['meta']))
        story.append(Spacer(1,8))
        story.extend(_num_grid(num_qs))

    story.append(Spacer(1,20))
    story.append(Paragraph('— End of OMR Sheet —', S['footer']))
    return story


def _bubble_grid(qs):
    """Proper OMR bubble grid using Table."""
    rows = []
    for i in range(0, len(qs), 2):
        pair = qs[i:i+2]
        row = []
        for q in pair:
            qno  = getattr(q,'question_number','?')
            is_m = _qtype(q)=='MCQ_MULTIPLE'
            # Inner table: Q-label + 4 bubbles
            inner = [[f'Q{qno}.', '  A  ', '  B  ', '  C  ', '  D  ']]
            if is_m: inner[0].append('[M]')
            else: inner[0].append('')
            wl = [1.2*cm, .9*cm, .9*cm, .9*cm, .9*cm, .7*cm]
            t = Table(inner, colWidths=wl)
            t.setStyle(TableStyle([
                ('FONTNAME',(0,0),(0,0),'Helvetica-Bold'),
                ('FONTNAME',(1,0),(-1,0),'Helvetica'),
                ('FONTSIZE',(0,0),(-1,-1),9),
                ('ALIGN',(1,0),(-1,0),'CENTER'),
                ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                ('BOX',(1,0),(4,0),1.5,colors.black),
                ('INNERGRID',(1,0),(4,0),1.5,colors.black),
                ('TOPPADDING',(0,0),(-1,-1),5),
                ('BOTTOMPADDING',(0,0),(-1,-1),5),
                ('BACKGROUND',(1,0),(4,0),colors.white),
                ('TEXTCOLOR',(5,0),(5,0),colors.grey),
                ('FONTSIZE',(5,0),(5,0),7),
            ]))
            row.append(t)
        if len(row) < 2: row.append('')
        rows.append(row)
    outer = Table(rows, colWidths=[(PAGE_W-2*MARGIN)/2]*2)
    outer.setStyle(TableStyle([
        ('TOPPADDING',(0,0),(-1,-1),1), ('BOTTOMPADDING',(0,0),(-1,-1),1),
        ('LEFTPADDING',(0,0),(-1,-1),4), ('RIGHTPADDING',(0,0),(-1,-1),4),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,colors.HexColor('#f8f9ff')]),
    ]))
    return [outer]


def _num_grid(qs):
    """Digit boxes for numerical answers."""
    rows = []
    for q in qs:
        qno = getattr(q,'question_number','?')
        # Sign + 4 integer digits + decimal + 2 decimal places
        inner = [[f'Q{qno}.',' ± ','□','□','□','□',' . ','□','□']]
        wl = [1.4*cm,.8*cm,.75*cm,.75*cm,.75*cm,.75*cm,.5*cm,.75*cm,.75*cm]
        t = Table(inner, colWidths=wl)
        t.setStyle(TableStyle([
            ('FONTNAME',(0,0),(-1,-1),'Courier-Bold'),
            ('FONTSIZE',(0,0),(-1,-1),11),
            ('ALIGN',(0,0),(-1,-1),'CENTER'),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('BOX',(1,0),(-1,0),1.5,colors.black),
            ('INNERGRID',(1,0),(-1,0),1.5,colors.black),
            ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,colors.HexColor('#f8f9ff')]),
        ]))
        rows.append([t,''])   # blank cell for alignment
    outer = Table(rows, colWidths=[(PAGE_W-2*MARGIN)*0.7, (PAGE_W-2*MARGIN)*0.3])
    outer.setStyle(TableStyle([
        ('TOPPADDING',(0,0),(-1,-1),2), ('BOTTOMPADDING',(0,0),(-1,-1),2),
    ]))
    return [outer]


def generate_answer_key(questions, exam_name, shift_label):
    return generate_question_paper(questions, exam_name, shift_label,
                                   include_omr=False, include_solutions=True)
