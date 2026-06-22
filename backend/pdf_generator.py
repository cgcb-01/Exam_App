"""
PDF generation — ReportLab.
Generates question papers, OMR sheets, and answer key PDFs.
Handles both text questions and image questions (inline).
"""
import io, os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image as RLImage
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas

PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm

def _styles():
    ss = getSampleStyleSheet()
    return {
        'title':  ParagraphStyle('ET',  parent=ss['Title'],   fontSize=16, spaceAfter=4, alignment=TA_CENTER, textColor=colors.HexColor('#1e3a8a')),
        'meta':   ParagraphStyle('EM',  parent=ss['Normal'],  fontSize=9,  spaceAfter=3, alignment=TA_CENTER, textColor=colors.grey),
        'secH':   ParagraphStyle('ES',  parent=ss['Normal'],  fontSize=11, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor('#1d4ed8'), fontName='Helvetica-Bold'),
        'qText':  ParagraphStyle('EQ',  parent=ss['Normal'],  fontSize=10, spaceAfter=3, leading=15, fontName='Helvetica'),
        'opt':    ParagraphStyle('EO',  parent=ss['Normal'],  fontSize=10, leftIndent=16, spaceAfter=2, leading=14),
        'solHd':  ParagraphStyle('ESH', parent=ss['Normal'],  fontSize=9,  textColor=colors.HexColor('#059669'), fontName='Helvetica-Bold'),
        'sol':    ParagraphStyle('ESB', parent=ss['Normal'],  fontSize=9,  leftIndent=12, textColor=colors.HexColor('#065f46'), leading=13),
        'ansBox': ParagraphStyle('EAB', parent=ss['Normal'],  fontSize=10, textColor=colors.HexColor('#dc2626'), fontName='Helvetica-Bold'),
        'small':  ParagraphStyle('ESM', parent=ss['Normal'],  fontSize=8,  textColor=colors.grey, alignment=TA_CENTER),
    }

def _get_image(path, max_width=14*cm, max_height=6*cm):
    """Load image from uploads directory, scale to fit."""
    if not path:
        return None
    # Try absolute path first, then relative
    candidates = [path, os.path.join('uploads', path), os.path.join('uploads/questions', os.path.basename(path))]
    for p in candidates:
        if os.path.exists(p):
            try:
                img = RLImage(p)
                # Scale maintaining aspect ratio
                iw, ih = img.imageWidth, img.imageHeight
                if iw and ih:
                    ratio = min(max_width/iw, max_height/ih, 1.0)
                    img.drawWidth  = iw * ratio
                    img.drawHeight = ih * ratio
                return img
            except Exception:
                pass
    return None

def generate_question_paper(questions: list, exam_name: str, shift_label: str,
                            include_omr: bool = False, include_solutions: bool = False) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    S = _styles()
    story = []

    # Header
    story.append(Paragraph(exam_name, S['title']))
    story.append(Paragraph(shift_label, S['meta']))
    story.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#1e3a8a'), spaceAfter=6))

    if questions:
        total_q = len(questions)
        mc_pos = sum(1 for q in questions if getattr(q, 'marks_correct', 4) > 0)
        story.append(Paragraph(
            f'Total Questions: {total_q}   |   Time: {3*60 if total_q >= 75 else 180} minutes   |   Maximum Marks: {int(sum(getattr(q,"marks_correct",4) for q in questions))}',
            S['meta']))
        story.append(Paragraph('Marking Scheme: Correct +4 | Incorrect -1 | Unattempted 0 (unless stated otherwise)', S['meta']))
        story.append(Spacer(1, 8))

    # Group by subject
    from collections import defaultdict
    by_subject = defaultdict(list)
    for q in questions:
        subj = q.subject.value if hasattr(q.subject, 'value') else str(q.subject)
        by_subject[subj].append(q)

    for subj, qs in by_subject.items():
        story.append(Paragraph(f'SECTION: {subj}', S['secH']))
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.lightgrey, spaceAfter=4))

        for q in qs:
            qno = getattr(q, 'question_number', '?')
            qtype = getattr(q, 'question_type', None)
            qtype_val = qtype.value if hasattr(qtype, 'value') else str(qtype or '')
            mc = getattr(q, 'marks_correct', 4)
            mi = getattr(q, 'marks_incorrect', -1)

            type_tag = ''
            if qtype_val == 'MCQ_MULTIPLE': type_tag = ' [Multiple Correct]'
            elif qtype_val == 'NUMERICAL': type_tag = ' [Integer Type]'

            block = []

            # Question number + marks
            block.append(Paragraph(
                f'<b>Q{qno}.{type_tag}</b>  <font size="8" color="grey">[+{mc}/{mi}]</font>',
                S['qText']))

            # Question text
            qtxt = getattr(q, 'question_text', '') or ''
            if qtxt:
                block.append(Paragraph(qtxt, S['qText']))

            # Question image
            qimg_path = getattr(q, 'question_image_path', None)
            if qimg_path:
                img = _get_image(qimg_path)
                if img:
                    block.append(img)
                else:
                    block.append(Paragraph(f'[Image: {qimg_path}]', S['meta']))

            # Options
            if qtype_val not in ('NUMERICAL', 'MATRIX_MATCH'):
                for opt_key in ('a', 'b', 'c', 'd'):
                    val = getattr(q, f'option_{opt_key}', None)
                    if val:
                        block.append(Paragraph(f'({opt_key.upper()})  {val}', S['opt']))
                # Options image
                oimg = getattr(q, 'options_image_path', None)
                if oimg:
                    img = _get_image(oimg, max_height=4*cm)
                    if img:
                        block.append(img)

            # Solution (if requested)
            if include_solutions:
                correct = getattr(q, 'correct_answer', '')
                block.append(Spacer(1, 3))
                block.append(Paragraph(f'Answer: {correct}', S['ansBox']))
                sol_text = getattr(q, 'solution_text', '') or ''
                if sol_text:
                    block.append(Paragraph('Solution:', S['solHd']))
                    block.append(Paragraph(sol_text, S['sol']))
                sol_img = getattr(q, 'solution_image_path', None)
                if sol_img:
                    img = _get_image(sol_img)
                    if img:
                        block.append(img)

            block.append(Spacer(1, 8))
            story.append(KeepTogether(block))

    # OMR section
    if include_omr:
        story.append(PageBreak())
        story.extend(_omr_section(questions, S, exam_name, shift_label))

    doc.build(story)
    return buf.getvalue()


def _omr_section(questions: list, S: dict, exam_name: str, shift_label: str) -> list:
    story = []
    story.append(Paragraph('OMR ANSWER SHEET', S['title']))
    story.append(Paragraph(f'{exam_name} — {shift_label}', S['meta']))
    story.append(Paragraph('Fill bubbles completely with BLACK/BLUE ink. Do NOT use pencil.', S['meta']))
    story.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#1e3a8a'), spaceAfter=10))

    # Student info
    info = [['Name:', '', 'Roll No:', ''], ['Date:', '', 'Invigilator:', '']]
    t = Table(info, colWidths=[2*cm, 7*cm, 2.5*cm, 5*cm])
    t.setStyle(TableStyle([
        ('FONTSIZE', (0,0),(-1,-1), 9), ('FONTNAME', (0,0),(-1,-1), 'Helvetica'),
        ('BOX', (1,0),(1,1), 0.5, colors.black), ('BOX', (3,0),(3,1), 0.5, colors.black),
        ('BOTTOMPADDING', (0,0),(-1,-1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    mcq_qs  = [q for q in questions if _qtype(q) in ('MCQ_SINGLE','MCQ_MULTIPLE')]
    num_qs  = [q for q in questions if _qtype(q) == 'NUMERICAL']

    if mcq_qs:
        story.append(Paragraph('SECTION A — Multiple Choice Questions', S['secH']))
        story.append(Spacer(1, 6))

        # 2-column bubble grid
        rows = []
        for i in range(0, len(mcq_qs), 2):
            row_cells = []
            for q in mcq_qs[i:i+2]:
                qno = getattr(q, 'question_number', i+1)
                is_multi = _qtype(q) == 'MCQ_MULTIPLE'
                # Build a mini-table per question
                cell_data = [[f'Q{qno}.', 'A', 'B', 'C', 'D', '[M]' if is_multi else '']]
                cell = Table(cell_data, colWidths=[1.2*cm,.7*cm,.7*cm,.7*cm,.7*cm,.6*cm])
                cell.setStyle(TableStyle([
                    ('FONTSIZE',(0,0),(-1,-1),9), ('FONTNAME',(0,0),(-1,-1),'Helvetica-Bold'),
                    ('ALIGN',(1,0),(-1,-1),'CENTER'), ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                    ('BOX',(1,0),(4,0),1.2,colors.black),
                    ('INNERGRID',(1,0),(4,0),1.2,colors.black),
                    ('BOTTOMPADDING',(0,0),(-1,-1),5), ('TOPPADDING',(0,0),(-1,-1),4),
                    ('BACKGROUND',(1,0),(4,0),colors.white),
                ]))
                row_cells.append(cell)
            while len(row_cells) < 2:
                row_cells.append('')
            rows.append(row_cells)

        grid = Table(rows, colWidths=[8*cm, 8*cm])
        grid.setStyle(TableStyle([
            ('BOTTOMPADDING',(0,0),(-1,-1),3), ('TOPPADDING',(0,0),(-1,-1),2),
            ('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white, colors.HexColor('#f8f9ff')]),
        ]))
        story.append(grid)
        story.append(Spacer(1, 14))

    if num_qs:
        story.append(Paragraph('SECTION B — Numerical Value Questions', S['secH']))
        story.append(Paragraph('Write the answer in the boxes. Use the leftmost box for sign (+/−).', S['meta']))
        story.append(Spacer(1, 6))

        num_rows = []
        for q in num_qs:
            qno = getattr(q, 'question_number', '?')
            # Sign + 4 int digits + decimal point + 2 decimal digits
            cells = [f'Q{qno}.', '±', '□', '□', '□', '□', '.', '□', '□']
            num_rows.append(cells)

        num_table = Table(num_rows, colWidths=[1.5*cm,.7*cm,.7*cm,.7*cm,.7*cm,.7*cm,.4*cm,.7*cm,.7*cm])
        num_table.setStyle(TableStyle([
            ('FONTSIZE',(0,0),(-1,-1),11), ('FONTNAME',(0,0),(-1,-1),'Courier-Bold'),
            ('ALIGN',(0,0),(-1,-1),'CENTER'), ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('BOX',(1,0),(-1,-1),1,colors.black),
            ('INNERGRID',(1,0),(-1,-1),1,colors.black),
            ('BACKGROUND',(1,0),(-1,-1),colors.white),
            ('BOTTOMPADDING',(0,0),(-1,-1),6), ('TOPPADDING',(0,0),(-1,-1),5),
            ('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,colors.HexColor('#f8f9ff')]),
        ]))
        story.append(num_table)

    return story


def _qtype(q) -> str:
    qt = getattr(q, 'question_type', None)
    if qt is None: return 'MCQ_SINGLE'
    return qt.value if hasattr(qt, 'value') else str(qt)


def generate_answer_key(questions: list, exam_name: str, shift_label: str) -> bytes:
    return generate_question_paper(questions, exam_name, shift_label,
                                   include_omr=False, include_solutions=True)
