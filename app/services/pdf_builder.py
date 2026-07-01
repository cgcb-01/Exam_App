import io
from typing import Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    FrameBreak, NextPageTemplate, PageTemplate, Frame, BaseDocTemplate,
    HRFlowable,
)
from reportlab.platypus.flowables import KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from sqlalchemy.orm import Session

from app.models.exam import Exam, ExamSection, Question

PAGE_W, PAGE_H = A4
MARGIN         = 1.5 * cm
COL_GAP        = 0.5 * cm
COL_W          = (PAGE_W - 2 * MARGIN - COL_GAP) / 2
BLACK = colors.black
WHITE = colors.white
GRAY  = colors.HexColor("#F0F0F0")
styles = getSampleStyleSheet()

TITLE_STYLE = ParagraphStyle(
    "ExamTitle",
    fontName    = "Times-Bold",
    fontSize    = 16,
    leading     = 20,
    alignment   = TA_CENTER,
    textColor   = WHITE,
    spaceAfter  = 2,
)
SUBTITLE_STYLE = ParagraphStyle(
    "ExamSubtitle",
    fontName    = "Times-Bold",
    fontSize    = 11,
    leading     = 14,
    alignment   = TA_CENTER,
    textColor   = WHITE,
    spaceAfter  = 0,
)
SECTION_STYLE = ParagraphStyle(
    "SectionHeader",
    fontName    = "Times-Bold",
    fontSize    = 11,
    leading     = 14,
    alignment   = TA_CENTER,
    textColor   = WHITE,
    spaceAfter  = 2,
    spaceBefore = 4,
)
QUESTION_STYLE = ParagraphStyle(
    "Question",
    fontName    = "Times-Bold",
    fontSize    = 10,
    leading     = 14,
    alignment   = TA_JUSTIFY,
    spaceAfter  = 3,
    spaceBefore = 3,
)
OPTION_STYLE = ParagraphStyle(
    "Option",
    fontName    = "Times-Roman",
    fontSize    = 10,
    leading     = 13,
    leftIndent  = 14,
    spaceAfter  = 1,
)
FOOTER_STYLE = ParagraphStyle(
    "Footer",
    fontName   = "Times-Bold",
    fontSize   = 8,
    alignment  = TA_CENTER,
    textColor  = WHITE,
)


def _render_content_blocks(blocks: list) -> str:
    parts = []
    if not blocks:
        return ""
    for block in blocks:
        btype = block.get("type", "text")
        if btype == "text":
            parts.append(f"<b>{block.get('value','')}</b>")
        elif btype == "latex":
            parts.append(f"<i>[{block.get('value','')}]</i>")
        elif btype == "image":
            parts.append(f"[Image: {block.get('url','')}]")
    return " ".join(parts)


def _black_header(canvas, doc, exam_title: str, subtitle: str):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(MARGIN, PAGE_H - MARGIN - 1.6*cm, PAGE_W - 2*MARGIN, 1.6*cm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Bold", 14)
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - MARGIN - 0.9*cm, exam_title[:80])
    canvas.setFont("Times-Bold", 9)
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - MARGIN - 1.4*cm, subtitle)
    canvas.restoreState()


def _black_footer(canvas, doc, exam_title: str, page_no: int):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(MARGIN, MARGIN, PAGE_W - 2*MARGIN, 0.6*cm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Bold", 8)
    canvas.drawCentredString(PAGE_W / 2, MARGIN + 0.15*cm,
                             f"{exam_title}  |  Page {page_no}")
    canvas.restoreState()


def build_exam_pdf(exam_id: str, db: Session) -> bytes:
    exam: Optional[Exam] = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise ValueError(f"Exam {exam_id} not found")

    is_jee_adv = exam.paper_style == "JEE_ADV"
    subtitle_parts = []
    if exam.year:        subtitle_parts.append(str(exam.year))
    if exam.shift:       subtitle_parts.append(exam.shift)
    if exam.paper_no:    subtitle_parts.append(f"Paper {exam.paper_no}")
    if exam.module_no:   subtitle_parts.append(f"Module {exam.module_no}")
    if exam.subject:     subtitle_parts.append(exam.subject)
    if exam.for_class != "ALL": subtitle_parts.append(exam.for_class)
    subtitle = "  |  ".join(subtitle_parts) if subtitle_parts else exam.exam_type

    buf = io.BytesIO()

    if is_jee_adv:
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=MARGIN + 1.8*cm, bottomMargin=MARGIN + 0.8*cm,
            compress=1,
        )
        story = _build_story(exam, single_col=True)
        doc.build(
            story,
            onFirstPage=lambda c, d: (_black_header(c, d, exam.title, subtitle),
                                       _black_footer(c, d, exam.title, 1)),
            onLaterPages=lambda c, d: (_black_header(c, d, exam.title, subtitle),
                                        _black_footer(c, d, exam.title, d.page)),
        )
    else:
        left_frame = Frame(
            MARGIN, MARGIN + 0.8*cm,
            COL_W, PAGE_H - 2*MARGIN - 1.8*cm - 0.8*cm,
            id="left", showBoundary=0,
        )
        right_frame = Frame(
            MARGIN + COL_W + COL_GAP, MARGIN + 0.8*cm,
            COL_W, PAGE_H - 2*MARGIN - 1.8*cm - 0.8*cm,
            id="right", showBoundary=0,
        )

        def on_page(canvas, doc):
            _black_header(canvas, doc, exam.title, subtitle)
            _black_footer(canvas, doc, exam.title, doc.page)
            canvas.setStrokeColor(BLACK)
            canvas.setLineWidth(1)
            x_div = MARGIN + COL_W + COL_GAP / 2
            canvas.line(x_div, MARGIN + 0.8*cm,
                        x_div, PAGE_H - MARGIN - 1.8*cm)

        doc = BaseDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=MARGIN + 1.8*cm, bottomMargin=MARGIN + 0.8*cm,
            compress=1,
        )
        template = PageTemplate(id="TwoCol", frames=[left_frame, right_frame], onPage=on_page)
        doc.addPageTemplates([template])
        story = _build_story(exam, single_col=False)
        doc.build(story)

    return buf.getvalue()


def _build_story(exam: Exam, single_col: bool) -> list:
    story = []
    if exam.instructions:
        story.append(Spacer(1, 4))
        story.append(Paragraph("<b>Instructions:</b>", QUESTION_STYLE))
        for line in exam.instructions.split("\n"):
            if line.strip():
                story.append(Paragraph(f"• {line.strip()}", OPTION_STYLE))
        story.append(Spacer(1, 6))

    for section in exam.sections:
        sec_data = [[Paragraph(
            f"SECTION {section.order_index + 1}: {section.title.upper()}  "
            f"[{section.question_type}] "
            f"(+{section.marks_correct} / {section.marks_wrong})",
            SECTION_STYLE
        )]]
        sec_table = Table(sec_data, colWidths=[COL_W if not single_col else (PAGE_W - 2*MARGIN)])
        sec_table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), BLACK),
            ("TEXTCOLOR",  (0,0), (-1,-1), WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(sec_table)
        story.append(Spacer(1, 4))

        for idx, question in enumerate(section.questions):
            q_text = _render_content_blocks(question.content)
            q_para = Paragraph(
                f"<b>Q{idx + 1}.</b> {q_text}",
                QUESTION_STYLE,
            )
            blocks = [q_para]

            if question.options:
                for opt in question.options:
                    opt_text = _render_content_blocks(opt.content)
                    blocks.append(Paragraph(f"({opt.option_label}) {opt_text}", OPTION_STYLE))

            story.append(KeepTogether(blocks))
            story.append(Spacer(1, 4))

        if not single_col:
            story.append(FrameBreak())

    return story


def build_omr_pdf(exam_id: str, db: Session, roll_no: str = "") -> bytes:
    from reportlab.platypus import Table as RLTable
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise ValueError("Exam not found")
    total_q = sum(len(s.questions) for s in exam.sections
                  if s.question_type in ("MCQ","MULTI"))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=MARGIN, rightMargin=MARGIN,
                            topMargin=MARGIN+1.8*cm, bottomMargin=MARGIN+0.8*cm,
                            compress=1)

    story = []
    rows = []
    for i in range(1, total_q + 1):
        row = [Paragraph(f"<b>{i}.</b>", QUESTION_STYLE)]
        for opt in ["A","B","C","D"]:
            row.append(Paragraph(f"<b>○ {opt}</b>", OPTION_STYLE))
        rows.append(row)

    if rows:
        t = RLTable(rows, colWidths=[1.0*cm, 1.5*cm, 1.5*cm, 1.5*cm, 1.5*cm])
        t.setStyle(TableStyle([
            ("GRID",      (0,0), (-1,-1), 0.5, BLACK),
            ("FONTNAME",  (0,0), (-1,-1), "Times-Bold"),
            ("FONTSIZE",  (0,0), (-1,-1), 10),
            ("BACKGROUND",(0,0), (0,-1), GRAY),
        ]))
        story.append(t)

    doc.build(
        story,
        onFirstPage=lambda c, d: _black_header(c, d, exam.title + " — OMR SHEET",
                                               f"Roll No: {roll_no}"),
        onLaterPages=lambda c, d: _black_header(c, d, exam.title + " — OMR SHEET",
                                                f"Roll No: {roll_no}"),
    )
    return buf.getvalue()