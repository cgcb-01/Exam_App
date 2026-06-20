"""PDF generation using ReportLab.
Generates:
  1. Question paper (questions only, no answers)
  2. Question paper + OMR answer sheet (JEE/NEET format)
  3. Answer key + solutions document
"""
import io, os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas

PAGE_W, PAGE_H = A4
MARGIN = 1.5 * cm


def _styles():
    ss = getSampleStyleSheet()
    title  = ParagraphStyle("ExamTitle",  parent=ss["Title"],   fontSize=16, spaceAfter=6,  alignment=TA_CENTER, textColor=colors.HexColor("#1a237e"))
    meta   = ParagraphStyle("ExamMeta",   parent=ss["Normal"],  fontSize=9,  spaceAfter=4,  alignment=TA_CENTER, textColor=colors.grey)
    sec    = ParagraphStyle("Section",    parent=ss["Heading2"],fontSize=11, spaceBefore=10,spaceAfter=4,  textColor=colors.HexColor("#1565c0"))
    q      = ParagraphStyle("Question",   parent=ss["Normal"],  fontSize=10, spaceAfter=3,  leading=14)
    opt    = ParagraphStyle("Option",     parent=ss["Normal"],  fontSize=10, leftIndent=14, spaceAfter=2,  leading=13)
    sol    = ParagraphStyle("Solution",   parent=ss["Normal"],  fontSize=9,  leftIndent=14, textColor=colors.HexColor("#2e7d32"), leading=13)
    ans    = ParagraphStyle("Answer",     parent=ss["Normal"],  fontSize=10, textColor=colors.HexColor("#b71c1c"), spaceAfter=2)
    footer = ParagraphStyle("Footer",     parent=ss["Normal"],  fontSize=8,  alignment=TA_CENTER, textColor=colors.grey)
    return dict(title=title, meta=meta, sec=sec, q=q, opt=opt, sol=sol, ans=ans, footer=footer)


def generate_question_paper(questions: list, exam_name: str, shift_label: str,
                             include_omr: bool = False, include_solutions: bool = False) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    S = _styles()
    story = []

    # Header
    story.append(Paragraph(exam_name, S["title"]))
    story.append(Paragraph(shift_label, S["meta"]))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a237e"), spaceAfter=8))

    # Marking scheme summary
    if questions:
        q0 = questions[0]
        mc = getattr(q0, "marks_correct", 4)
        mi = getattr(q0, "marks_incorrect", -1)
        story.append(Paragraph(
            f"Total Questions: {len(questions)}  |  Correct: +{mc}  |  Wrong: {mi}  |  Unattempted: 0",
            S["meta"]))
        story.append(Spacer(1, 6))

    # Group by subject
    from collections import defaultdict
    by_subject = defaultdict(list)
    for q in questions:
        by_subject[q.subject.value].append(q)

    for subj, qs in by_subject.items():
        story.append(Paragraph(subj.title(), S["sec"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
        for q in qs:
            qno = getattr(q, "question_number", 0)
            qtype = getattr(q, "question_type", None)
            qtype_label = ""
            if qtype:
                if qtype.value == "MCQ_MULTIPLE": qtype_label = " [Multiple Correct]"
                elif qtype.value == "NUMERICAL":  qtype_label = " [Numerical]"

            qtxt = getattr(q, "question_text", "") or ""
            block = [
                Paragraph(f"<b>Q{qno}.{qtype_label}</b>  {qtxt}", S["q"]),
            ]
            # Options
            for opt_key in ("A", "B", "C", "D"):
                val = getattr(q, f"option_{opt_key.lower()}", None)
                if val:
                    block.append(Paragraph(f"({opt_key})  {val}", S["opt"]))

            if include_solutions:
                correct = getattr(q, "correct_answer", "")
                sol_txt = getattr(q, "solution_text", "") or ""
                block.append(Paragraph(f"<b>Answer:</b> {correct}", S["ans"]))
                if sol_txt:
                    block.append(Paragraph(f"<b>Solution:</b> {sol_txt}", S["sol"]))

            block.append(Spacer(1, 5))
            story.append(KeepTogether(block))

    # OMR Sheet section
    if include_omr:
        story.append(PageBreak())
        story.extend(_build_omr_section(questions, S))

    doc.build(story)
    return buf.getvalue()


def _build_omr_section(questions: list, S: dict) -> list:
    """Build a printable OMR bubble-sheet for JEE/NEET format."""
    story = []
    story.append(Paragraph("OMR ANSWER SHEET", S["title"]))
    story.append(Paragraph("Fill bubbles completely with a dark pen. Do NOT use pencil.", S["meta"]))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a237e"), spaceAfter=10))

    # Student info boxes
    info_data = [
        ["Name:", "", "Roll No:", ""],
        ["Date:", "", "Shift:", ""],
    ]
    info_table = Table(info_data, colWidths=[2.5*cm, 8*cm, 2.5*cm, 5*cm])
    info_table.setStyle(TableStyle([
        ("BOX", (1,0),(1,1), 0.5, colors.black),
        ("BOX", (3,0),(3,1), 0.5, colors.black),
        ("FONTSIZE", (0,0),(-1,-1), 9),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 10))

    # MCQ Bubble grid
    mcq_qs  = [q for q in questions if getattr(q, "question_type", None) and q.question_type.value in ("MCQ_SINGLE","MCQ_MULTIPLE")]
    num_qs  = [q for q in questions if getattr(q, "question_type", None) and q.question_type.value == "NUMERICAL"]

    if mcq_qs:
        story.append(Paragraph("Section – Multiple Choice Questions", S["sec"]))
        story.append(Spacer(1, 4))
        # 2-column layout of bubbles
        rows = []
        for i in range(0, len(mcq_qs), 2):
            row = []
            for q in mcq_qs[i:i+2]:
                qno = getattr(q, "question_number", i+1)
                is_multi = q.question_type.value == "MCQ_MULTIPLE"
                cell_content = f"Q{qno}.  "
                for opt in ("A", "B", "C", "D"):
                    cell_content += f"○{opt}  "
                if is_multi: cell_content += "  [Multi]"
                row.append(cell_content)
            if len(row) == 1: row.append("")
            rows.append(row)
        omr_table = Table(rows, colWidths=[9*cm, 9*cm])
        omr_table.setStyle(TableStyle([
            ("FONTSIZE", (0,0),(-1,-1), 9),
            ("FONTNAME", (0,0),(-1,-1), "Courier"),
            ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ("TOPPADDING",(0,0),(-1,-1), 3),
            ("ROWBACKGROUNDS",(0,0),(-1,-1),[colors.white, colors.HexColor("#f5f5f5")]),
            ("GRID",(0,0),(-1,-1),0.2,colors.lightgrey),
        ]))
        story.append(omr_table)
        story.append(Spacer(1, 12))

    if num_qs:
        story.append(Paragraph("Section – Numerical Value Questions", S["sec"]))
        story.append(Spacer(1, 4))
        num_rows = []
        for q in num_qs:
            qno = getattr(q, "question_number", "?")
            # Show digit boxes: sign box + 4 digit boxes + decimal + 2 decimal digit boxes
            num_rows.append([f"Q{qno}.", "±", "□", "□", "□", "□", ".", "□", "□"])
        num_table = Table(num_rows, colWidths=[1.5*cm, 0.8*cm, 1*cm, 1*cm, 1*cm, 1*cm, 0.6*cm, 1*cm, 1*cm])
        num_table.setStyle(TableStyle([
            ("FONTSIZE", (0,0),(-1,-1), 10),
            ("FONTNAME", (0,0),(-1,-1), "Courier"),
            ("ALIGN",(0,0),(-1,-1),"CENTER"),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("BOX",(1,0),(-1,-1),0.8,colors.black),
            ("INNERGRID",(1,0),(-1,-1),0.5,colors.grey),
            ("BOTTOMPADDING",(0,0),(-1,-1),6),
            ("TOPPADDING",(0,0),(-1,-1),4),
        ]))
        story.append(num_table)

    return story


def generate_answer_key(questions: list, exam_name: str, shift_label: str) -> bytes:
    """Compact answer key + full solutions PDF."""
    return generate_question_paper(questions, exam_name, shift_label,
                                   include_omr=False, include_solutions=True)
