"""
Seed the database with:
  - 3 exams (JEE Main, JEE Advanced, NEET)
  - Years 2020-2024 for each exam
  - Multiple shifts for JEE Main, single paper for others
  - Sample questions for each shift
  - Premium tracks (Engineering, NEET) with subjects, DPP sets, test sets, mock tests
  - Sample news items
  - Admin user
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.models.db import (
    init_db, SessionLocal,
    Exam, Year, Shift, Question,
    PremiumExamTrack, PremiumSubject, DppSet, Dpp, TestSet, Chapter, Module, MockTest,
    NewsItem, User,
    ExamType, SubjectName, QuestionType, ContentFormat
)
from backend.auth import hash_password
from datetime import datetime

def seed():
    init_db()
    db = SessionLocal()
    try:
        if db.query(Exam).count() > 0:
            print("DB already seeded.")
            return

        print("Seeding database...")

        # ── Admin user ────────────────────────────────────────────────────
        admin = User(
            email="admin@examprep.in",
            full_name="Admin",
            hashed_password=hash_password("admin123"),
            is_admin=True,
        )
        db.add(admin)
        db.flush()

        # ── Exams ─────────────────────────────────────────────────────────
        jee_main = Exam(type=ExamType.JEE_MAIN,     display_name="JEE Main")
        jee_adv  = Exam(type=ExamType.JEE_ADVANCED, display_name="JEE Advanced")
        neet     = Exam(type=ExamType.NEET,          display_name="NEET UG")
        db.add_all([jee_main, jee_adv, neet])
        db.flush()

        # ── JEE Main: 2020-2024, each year has 2 sessions × 2 shifts ──────
        jm_shifts = []  # collect for question seeding
        for yr in range(2020, 2025):
            year_obj = Year(exam_id=jee_main.id, year=yr)
            db.add(year_obj); db.flush()
            sessions = []
            if yr >= 2021:
                sessions = [
                    (f"Jan {str(yr)[2:]} Shift 1", f"{yr}-01-24"),
                    (f"Jan {str(yr)[2:]} Shift 2", f"{yr}-01-25"),
                    (f"Apr {str(yr)[2:]} Shift 1", f"{yr}-04-08"),
                    (f"Apr {str(yr)[2:]} Shift 2", f"{yr}-04-09"),
                ]
            else:
                sessions = [
                    ("Jan 20 Shift 1", "2020-01-07"),
                    ("Jan 20 Shift 2", "2020-01-08"),
                    ("Sep 20 Shift 1", "2020-09-02"),
                    ("Sep 20 Shift 2", "2020-09-03"),
                ]
            for label, date_str in sessions:
                sh = Shift(year_id=year_obj.id, label=label, exam_date=date_str)
                db.add(sh); db.flush()
                jm_shifts.append(sh)

        # ── JEE Advanced: 2020-2024, Paper 1 & Paper 2 ───────────────────
        jadv_shifts = []
        for yr in range(2020, 2025):
            year_obj = Year(exam_id=jee_adv.id, year=yr)
            db.add(year_obj); db.flush()
            for paper in ("Paper 1", "Paper 2"):
                sh = Shift(year_id=year_obj.id, label=paper, exam_date=f"{yr}-05-28")
                db.add(sh); db.flush()
                jadv_shifts.append(sh)

        # ── NEET: 2020-2024, single paper ────────────────────────────────
        neet_shifts = []
        for yr in range(2020, 2025):
            year_obj = Year(exam_id=neet.id, year=yr)
            db.add(year_obj); db.flush()
            sh = Shift(year_id=year_obj.id, label="Paper", exam_date=f"{yr}-05-03")
            db.add(sh); db.flush()
            neet_shifts.append(sh)

        # ── Sample questions ──────────────────────────────────────────────
        # JEE Main sample (3 shifts with full question sets for demo)
        jm_sample_data = [
            # (subject, type, q_text, optA, optB, optC, optD, answer, solution, marks_correct, marks_incorrect)
            (SubjectName.PHYSICS, QuestionType.MCQ_SINGLE,
             "A particle moves in a straight line with uniform acceleration. If its velocity changes from 10 m/s to 30 m/s in 5 seconds, find the acceleration.",
             "2 m/s²","4 m/s²","6 m/s²","8 m/s²","B",
             "Using v = u + at → 30 = 10 + a×5 → a = 20/5 = 4 m/s²", 4, -1),
            (SubjectName.PHYSICS, QuestionType.NUMERICAL,
             "A body of mass 2 kg is moving with velocity 5 m/s. Find its kinetic energy in Joules.",
             None,None,None,None,"25",
             "KE = ½mv² = ½ × 2 × 25 = 25 J", 4, -1),
            (SubjectName.PHYSICS, QuestionType.MCQ_SINGLE,
             "The electric field inside a conductor in electrostatic equilibrium is:",
             "Maximum","Minimum","Zero","Uniform","C",
             "In electrostatic equilibrium, free charges redistribute such that the net electric field inside the conductor becomes zero.", 4, -1),
            (SubjectName.CHEMISTRY, QuestionType.MCQ_SINGLE,
             "Which of the following is an example of a Lewis acid?",
             "NH₃","H₂O","BF₃","OH⁻","C",
             "BF₃ is electron deficient (boron has empty p orbital) and acts as a Lewis acid by accepting electron pairs.", 4, -1),
            (SubjectName.CHEMISTRY, QuestionType.MCQ_SINGLE,
             "The IUPAC name of CH₃–CH(OH)–CH₃ is:",
             "1-propanol","2-propanol","Isopropanol","Propan-2-ol","D",
             "IUPAC name: propan-2-ol. The OH group is on carbon-2 of a 3-carbon chain.", 4, -1),
            (SubjectName.CHEMISTRY, QuestionType.NUMERICAL,
             "How many moles of CO₂ are produced when 44 g of CO₂ is dissolved? (Molar mass of CO₂ = 44 g/mol)",
             None,None,None,None,"1",
             "Moles = mass / molar mass = 44 / 44 = 1 mol", 4, -1),
            (SubjectName.MATHS, QuestionType.MCQ_SINGLE,
             "If f(x) = x² + 3x + 2, then f(−1) equals:",
             "0","2","−1","6","A",
             "f(−1) = (−1)² + 3(−1) + 2 = 1 − 3 + 2 = 0", 4, -1),
            (SubjectName.MATHS, QuestionType.MCQ_SINGLE,
             "The value of ∫₀¹ x² dx is:",
             "1/2","1/3","1/4","2/3","B",
             "∫₀¹ x² dx = [x³/3]₀¹ = 1/3 − 0 = 1/3", 4, -1),
            (SubjectName.MATHS, QuestionType.NUMERICAL,
             "Find the number of ways to arrange the letters of the word EXAM.",
             None,None,None,None,"24",
             "EXAM has 4 distinct letters. Arrangements = 4! = 24", 4, -1),
        ]

        for shift in jm_shifts[:4]:  # seed first 4 shifts with sample questions
            for i, (subj, qtype, qtxt, a, b, c, d, ans, sol, mc, mi) in enumerate(jm_sample_data, 1):
                q = Question(
                    shift_id=shift.id, subject=subj, question_type=qtype,
                    question_number=i, question_format=ContentFormat.TEXT,
                    question_text=qtxt, option_a=a, option_b=b, option_c=c, option_d=d,
                    correct_answer=ans, marks_correct=mc, marks_incorrect=mi,
                    solution_format=ContentFormat.TEXT, solution_text=sol,
                )
                db.add(q)

        # JEE Advanced sample (MCQ_MULTIPLE + NUMERICAL)
        jadv_data = [
            (SubjectName.PHYSICS, QuestionType.MCQ_MULTIPLE,
             "Which of the following statements about projectile motion are correct?",
             "Horizontal velocity is constant","Vertical acceleration is g downward",
             "Time of flight depends on horizontal velocity","Range is maximum at 45°",
             "A,B,D",
             "In projectile motion: horizontal velocity is constant (no air resistance), vertical acceleration = g, time of flight is independent of horizontal velocity, and range is maximum at 45°.", 4, -2),
            (SubjectName.PHYSICS, QuestionType.NUMERICAL,
             "A spring of spring constant 200 N/m is compressed by 0.1 m. Find the elastic potential energy stored (in Joules).",
             None,None,None,None,"1",
             "PE = ½kx² = ½ × 200 × 0.01 = 1 J", 4, 0),
            (SubjectName.CHEMISTRY, QuestionType.MCQ_MULTIPLE,
             "Which of the following are colligative properties?",
             "Elevation of boiling point","Depression of freezing point","Osmotic pressure","Vapour pressure of solvent",
             "A,B,C",
             "Colligative properties depend on number of solute particles: boiling point elevation, freezing point depression, and osmotic pressure. Vapour pressure of pure solvent is not a colligative property.", 4, -2),
            (SubjectName.MATHS, QuestionType.MCQ_SINGLE,
             "The number of real solutions of x² + |x| + 1 = 0 is:",
             "0","1","2","4","A",
             "x² ≥ 0, |x| ≥ 0, so x² + |x| + 1 ≥ 1 > 0 for all real x. No real solutions.", 3, -1),
        ]

        for shift in jadv_shifts[:2]:
            for i, (subj, qtype, qtxt, a, b, c, d, ans, sol, mc, mi) in enumerate(jadv_data, 1):
                q = Question(
                    shift_id=shift.id, subject=subj, question_type=qtype,
                    question_number=i, question_format=ContentFormat.TEXT,
                    question_text=qtxt, option_a=a, option_b=b, option_c=c, option_d=d,
                    correct_answer=ans, marks_correct=mc, marks_incorrect=mi,
                    solution_format=ContentFormat.TEXT, solution_text=sol,
                )
                db.add(q)

        # NEET sample
        neet_data = [
            (SubjectName.PHYSICS, QuestionType.MCQ_SINGLE,
             "The SI unit of electric charge is:",
             "Ampere","Coulomb","Volt","Watt","B",
             "The SI unit of electric charge is the Coulomb (C). 1 C = charge carried by 6.24 × 10¹⁸ electrons.", 4, -1),
            (SubjectName.CHEMISTRY, QuestionType.MCQ_SINGLE,
             "Which of the following has the highest electronegativity?",
             "Oxygen","Nitrogen","Fluorine","Chlorine","C",
             "Fluorine has the highest electronegativity (3.98 on Pauling scale) of all elements.", 4, -1),
            (SubjectName.BIOLOGY, QuestionType.MCQ_SINGLE,
             "The powerhouse of the cell is:",
             "Nucleus","Ribosome","Mitochondria","Golgi apparatus","C",
             "Mitochondria are called the powerhouse of the cell because they produce ATP through cellular respiration.", 4, -1),
            (SubjectName.BIOLOGY, QuestionType.MCQ_SINGLE,
             "Which blood group is known as the universal donor?",
             "A","B","AB","O","D",
             "Blood group O (O negative specifically) is the universal donor because it lacks A and B antigens on red blood cells.", 4, -1),
            (SubjectName.BIOLOGY, QuestionType.MCQ_SINGLE,
             "DNA replication is:",
             "Conservative","Semi-conservative","Dispersive","None of these","B",
             "DNA replication is semi-conservative: each new DNA molecule contains one original strand and one newly synthesized strand, as demonstrated by the Meselson-Stahl experiment.", 4, -1),
        ]

        for shift in neet_shifts[:2]:
            for i, (subj, qtype, qtxt, a, b, c, d, ans, sol, mc, mi) in enumerate(neet_data, 1):
                q = Question(
                    shift_id=shift.id, subject=subj, question_type=qtype,
                    question_number=i, question_format=ContentFormat.TEXT,
                    question_text=qtxt, option_a=a, option_b=b, option_c=c, option_d=d,
                    correct_answer=ans, marks_correct=mc, marks_incorrect=mi,
                    solution_format=ContentFormat.TEXT, solution_text=sol,
                )
                db.add(q)

        # ── Premium Tracks ────────────────────────────────────────────────
        eng_track  = PremiumExamTrack(name="ENGINEERING", display_name="Engineering (JEE)", is_active=True)
        neet_track = PremiumExamTrack(name="NEET",        display_name="NEET UG",           is_active=True)
        db.add_all([eng_track, neet_track]); db.flush()

        # Engineering subjects: Physics, Chemistry, Maths
        for subj_name in [SubjectName.PHYSICS, SubjectName.CHEMISTRY, SubjectName.MATHS]:
            subj = PremiumSubject(track_id=eng_track.id, name=subj_name, is_active=True)
            db.add(subj); db.flush()
            _seed_premium_subject(db, subj, subj_name, "Engineering")

        # NEET subjects: Physics, Chemistry, Biology
        # NOTE: Maths for NEET is created but is_active=False (commented feature)
        for subj_name, active in [(SubjectName.PHYSICS, True), (SubjectName.CHEMISTRY, True),
                                   (SubjectName.BIOLOGY, True), (SubjectName.MATHS, False)]:
            subj = PremiumSubject(track_id=neet_track.id, name=subj_name, is_active=active)
            db.add(subj); db.flush()
            if active:
                _seed_premium_subject(db, subj, subj_name, "NEET")

        # ── News ──────────────────────────────────────────────────────────
        news_items = [
            NewsItem(title="JEE Main 2025 Session 1 Registration Open",
                     body="NTA has opened registration for JEE Main 2025 Session 1. Last date to apply is November 22, 2024.",
                     exam_type=ExamType.JEE_MAIN, published_at=datetime(2024, 11, 1)),
            NewsItem(title="JEE Advanced 2025 Schedule Released",
                     body="IIT Kanpur will conduct JEE Advanced 2025 on May 18, 2025. Registration begins after JEE Main results.",
                     exam_type=ExamType.JEE_ADVANCED, published_at=datetime(2024, 11, 5)),
            NewsItem(title="NEET UG 2025 Exam Date Announced",
                     body="NEET UG 2025 will be held on May 4, 2025. NTA will release the official notification in January 2025.",
                     exam_type=ExamType.NEET, published_at=datetime(2024, 11, 8)),
            NewsItem(title="New PYQ sets added for JEE Main 2024 April Session",
                     body="We have added complete question papers for all shifts of JEE Main 2024 April session with detailed solutions.",
                     exam_type=None, published_at=datetime(2024, 11, 10)),
        ]
        db.add_all(news_items)

        db.commit()
        print("✓ Database seeded successfully.")
        print("  Admin login: admin@examprep.in / admin123")

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


def _seed_premium_subject(db, subj, subj_name, track_label):
    """Create DPP set, test set with chapters/modules, and mock tests for a subject."""
    chapters_by_subject = {
        SubjectName.PHYSICS:   ["Kinematics","Laws of Motion","Work Energy Power","Rotational Motion","Gravitation","Thermodynamics","Waves","Electrostatics","Current Electricity","Magnetism","Optics","Modern Physics"],
        SubjectName.CHEMISTRY: ["Atomic Structure","Chemical Bonding","States of Matter","Thermodynamics","Equilibrium","Electrochemistry","Organic Chemistry Basics","Hydrocarbons","Coordination Compounds","Biomolecules","Polymers","p-Block Elements"],
        SubjectName.MATHS:     ["Sets and Functions","Trigonometry","Algebra","Coordinate Geometry","Calculus","Vectors","3D Geometry","Probability","Statistics","Matrices","Complex Numbers","Sequences and Series"],
        SubjectName.BIOLOGY:   ["Cell Biology","Genetics","Evolution","Plant Physiology","Human Physiology","Ecology","Reproduction","Biotechnology","Biodiversity","Microbes","Body Fluids","Locomotion"],
    }
    chapters = chapters_by_subject.get(subj_name, ["Chapter 1"])

    # DPP Sets (2 sets with varying question counts)
    for set_num, qcount in enumerate([10, 15], 1):
        dpp_set = DppSet(subject_id=subj.id, name=f"DPP Set {set_num}", questions_per_dpp=qcount)
        db.add(dpp_set); db.flush()
        for i, ch in enumerate(chapters[:6], 1):
            dpp = Dpp(dpp_set_id=dpp_set.id, title=f"DPP {i} – {ch}",
                      chapter_name=ch, order_index=i, duration_minutes=qcount * 2)
            db.add(dpp); db.flush()
            # Seed 2 sample questions per DPP
            for qn in range(1, 3):
                db.add(Question(
                    dpp_id=dpp.id, subject=subj_name,
                    question_type=QuestionType.MCQ_SINGLE, question_number=qn,
                    question_format=ContentFormat.TEXT,
                    question_text=f"Sample {subj_name.value.title()} question {qn} from {ch} (DPP Set {set_num}).",
                    option_a="Option A", option_b="Option B",
                    option_c="Option C", option_d="Option D",
                    correct_answer="A", marks_correct=4.0, marks_incorrect=-1.0,
                    solution_format=ContentFormat.TEXT,
                    solution_text=f"Correct answer is A. Detailed explanation for {ch} concept.", topic=ch,
                ))

    # Chapterwise Test Sets (2 sets)
    for set_num in range(1, 3):
        test_set = TestSet(subject_id=subj.id, name=f"Set {set_num}")
        db.add(test_set); db.flush()
        for ch_idx, ch_name in enumerate(chapters, 1):
            chapter = Chapter(test_set_id=test_set.id, name=ch_name, order_index=ch_idx)
            db.add(chapter); db.flush()
            for mod_num in range(1, 3):
                module = Module(chapter_id=chapter.id, name=f"Module {mod_num}", order_index=mod_num, duration_minutes=30)
                db.add(module); db.flush()
                for qn in range(1, 4):
                    db.add(Question(
                        module_id=module.id, subject=subj_name,
                        question_type=QuestionType.MCQ_SINGLE, question_number=qn,
                        question_format=ContentFormat.TEXT,
                        question_text=f"{subj_name.value.title()}: {ch_name} – Module {mod_num}, Q{qn}. Sample question text.",
                        option_a="Option A", option_b="Option B",
                        option_c="Option C", option_d="Option D",
                        correct_answer="B", marks_correct=4.0, marks_incorrect=-1.0,
                        solution_format=ContentFormat.TEXT,
                        solution_text=f"The answer is B. Explanation for {ch_name} Module {mod_num}.", topic=ch_name,
                    ))

    # Full Syllabus Mock Tests
    for mt_num in range(1, 4):
        mock = MockTest(subject_id=subj.id, title=f"{track_label} {subj_name.value.title()} Mock Test {mt_num}",
                        duration_minutes=180 if track_label == "Engineering" else 200, order_index=mt_num)
        db.add(mock); db.flush()
        for qn in range(1, 11):
            db.add(Question(
                mock_test_id=mock.id, subject=subj_name,
                question_type=QuestionType.MCQ_SINGLE, question_number=qn,
                question_format=ContentFormat.TEXT,
                question_text=f"Full syllabus mock test Q{qn}: {subj_name.value.title()} question covering mixed topics.",
                option_a="Option A", option_b="Option B",
                option_c="Option C", option_d="Option D",
                correct_answer="C", marks_correct=4.0, marks_incorrect=-1.0,
                solution_format=ContentFormat.TEXT,
                solution_text=f"Answer is C. Full explanation for mock test Q{qn}.",
            ))

if __name__ == "__main__":
    seed()

