"""
Seed the database with:
  - 3 exams (JEE Main, JEE Advanced, NEET)
  - Years 2020-2024 for each exam
  - Multiple shifts with 20+ questions each
  - Sample questions for each shift
  - Premium tracks with DPPs, tests, mocks
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
import random

def seed():
    init_db()
    db = SessionLocal()
    try:
        # Clear existing data (optional - comment out if you want to keep existing)
        # db.query(Question).delete()
        # db.query(Shift).delete()
        # db.query(Year).delete()
        # db.query(Exam).delete()
        # db.commit()
        
        if db.query(Exam).count() > 0:
            print("DB already seeded. Adding more questions...")
            # Add more questions to existing shifts
            _add_more_questions(db)
            db.commit()
            print("✅ Added more questions!")
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

        # ── JEE Main: 2020-2024 ──────────────────────────────────────────
        jm_shifts = []
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

        # ── JEE Advanced: 2020-2024 ──────────────────────────────────────
        jadv_shifts = []
        for yr in range(2020, 2025):
            year_obj = Year(exam_id=jee_adv.id, year=yr)
            db.add(year_obj); db.flush()
            for paper in ("Paper 1", "Paper 2"):
                sh = Shift(year_id=year_obj.id, label=paper, exam_date=f"{yr}-05-28")
                db.add(sh); db.flush()
                jadv_shifts.append(sh)

        # ── NEET: 2020-2024 ──────────────────────────────────────────────
        neet_shifts = []
        for yr in range(2020, 2025):
            year_obj = Year(exam_id=neet.id, year=yr)
            db.add(year_obj); db.flush()
            sh = Shift(year_id=year_obj.id, label="Paper", exam_date=f"{yr}-05-03")
            db.add(sh); db.flush()
            neet_shifts.append(sh)

        # ── Add questions to all shifts ──────────────────────────────────
        _add_questions_to_shifts(db, jm_shifts, "JEE_MAIN")
        _add_questions_to_shifts(db, jadv_shifts, "JEE_ADVANCED")
        _add_questions_to_shifts(db, neet_shifts, "NEET")

        # ── Premium Tracks ────────────────────────────────────────────────
        eng_track  = PremiumExamTrack(name="ENGINEERING", display_name="Engineering (JEE)", is_active=True)
        neet_track = PremiumExamTrack(name="NEET",        display_name="NEET UG",           is_active=True)
        db.add_all([eng_track, neet_track]); db.flush()

        # Engineering subjects
        for subj_name in [SubjectName.PHYSICS, SubjectName.CHEMISTRY, SubjectName.MATHS]:
            subj = PremiumSubject(track_id=eng_track.id, name=subj_name, is_active=True)
            db.add(subj); db.flush()
            _seed_premium_subject(db, subj, subj_name, "Engineering")

        # NEET subjects
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

def _add_questions_to_shifts(db, shifts, exam_type):
    """Add 20+ questions to each shift"""
    for shift in shifts:
        # Physics questions
        physics_questions = [
            ("A particle moves with velocity v = 2t² + 3t m/s. Find acceleration at t=2s.", 
             "7 m/s²", "11 m/s²", "8 m/s²", "10 m/s²", "A", "a = dv/dt = 4t + 3, at t=2: a = 11 m/s²"),
            ("What is the work done by a force F = 5N moving an object 10m?",
             "25 J", "50 J", "75 J", "100 J", "B", "W = F × d = 5 × 10 = 50 J"),
            ("A ball is thrown upward with velocity 20 m/s. Find max height (g=10 m/s²).",
             "10 m", "15 m", "20 m", "25 m", "C", "h = v²/2g = 400/20 = 20 m"),
            ("What is the SI unit of force?",
             "Newton", "Joule", "Watt", "Pascal", "A", "The SI unit of force is Newton (N)."),
            ("A body of mass 2 kg has KE 100 J. Find its velocity.",
             "5 m/s", "7 m/s", "10 m/s", "14 m/s", "C", "KE = ½mv² → v² = 2KE/m = 200/2 = 100 → v = 10 m/s"),
            ("What is the acceleration due to gravity on Earth?",
             "8.9 m/s²", "9.8 m/s²", "10.8 m/s²", "11.8 m/s²", "B", "Standard value of g on Earth is 9.8 m/s²."),
            ("A spring with k=100 N/m is compressed by 0.05m. Find PE stored.",
             "0.125 J", "0.25 J", "0.5 J", "1 J", "A", "PE = ½kx² = ½ × 100 × 0.0025 = 0.125 J"),
        ]
        
        # Chemistry questions
        chemistry_questions = [
            ("What is the molar mass of H₂O?",
             "16 g/mol", "18 g/mol", "20 g/mol", "22 g/mol", "B", "H₂O: 2×1 + 16 = 18 g/mol"),
            ("Which is a noble gas?",
             "Oxygen", "Nitrogen", "Helium", "Chlorine", "C", "Helium (He) is a noble gas in Group 18."),
            ("What is the pH of pure water?",
             "5", "6", "7", "8", "C", "Pure water has pH = 7 at 25°C."),
            ("Which is an acid?",
             "NaOH", "HCl", "NaCl", "KOH", "B", "HCl (Hydrochloric acid) is an acid."),
            ("What is the atomic number of Carbon?",
             "4", "5", "6", "7", "C", "Carbon has atomic number 6."),
            ("Which is an alkane?",
             "C₂H₄", "C₂H₂", "C₂H₆", "C₆H₆", "C", "C₂H₆ (Ethane) is an alkane."),
            ("What is the formula of Sulphuric Acid?",
             "H₂SO₃", "H₂SO₄", "H₂S₂O₃", "H₂S₂O₇", "B", "Sulphuric acid formula is H₂SO₄."),
        ]
        
        # Maths questions
        maths_questions = [
            ("What is the derivative of x²?",
             "x", "2x", "x²", "2x²", "B", "d/dx(x²) = 2x"),
            ("What is the integral of 2x dx?",
             "x² + C", "x²", "2x² + C", "x + C", "A", "∫2x dx = x² + C"),
            ("What is the value of sin 90°?",
             "0", "0.5", "1", "√2/2", "C", "sin 90° = 1"),
            ("Solve for x: 2x + 3 = 7",
             "1", "2", "3", "4", "B", "2x = 4 → x = 2"),
            ("What is the area of a circle with radius 7?",
             "49π", "14π", "28π", "98π", "A", "Area = πr² = 49π"),
            ("What is log₁₀(100)?",
             "1", "2", "3", "4", "B", "log₁₀(100) = 2"),
            ("What is the slope of y = 2x + 3?",
             "1", "2", "3", "4", "B", "Slope is the coefficient of x: 2"),
        ]

        # For NEET, add Biology questions instead of Maths
        if exam_type == "NEET":
            biology_questions = [
                ("What is the powerhouse of the cell?",
                 "Nucleus", "Ribosome", "Mitochondria", "Golgi", "C", "Mitochondria produce ATP."),
                ("Which blood group is universal donor?",
                 "A", "B", "AB", "O", "D", "O negative is universal donor."),
                ("What is the largest organ in human body?",
                 "Liver", "Skin", "Brain", "Heart", "B", "Skin is the largest organ."),
                ("Which is an example of a prokaryote?",
                 "Eukarya", "Bacteria", "Fungi", "Plantae", "B", "Bacteria are prokaryotes."),
                ("What is the function of DNA?",
                 "Energy storage", "Cell division", "Genetic information", "Protein synthesis", "C", "DNA stores genetic information."),
                ("Which is a vitamin?",
                 "Calcium", "Iron", "Vitamin C", "Protein", "C", "Vitamin C is a vitamin."),
            ]
            # Combine all questions for NEET
            all_questions = physics_questions + chemistry_questions + biology_questions
        else:
            # For JEE Main and Advanced: Physics + Chemistry + Maths
            all_questions = physics_questions + chemistry_questions + maths_questions

        # Add questions to this shift
        for i, q in enumerate(all_questions[:25], 1):  # Add up to 25 questions per shift
            question = Question(
                shift_id=shift.id,
                subject=SubjectName.PHYSICS if i <= len(physics_questions) else 
                       SubjectName.CHEMISTRY if i <= len(physics_questions) + len(chemistry_questions) else
                       SubjectName.MATHS if exam_type != "NEET" else SubjectName.BIOLOGY,
                question_type=QuestionType.MCQ_SINGLE,
                question_number=i,
                question_format=ContentFormat.TEXT,
                question_text=q[0],
                option_a=q[1],
                option_b=q[2],
                option_c=q[3],
                option_d=q[4],
                correct_answer=q[5],
                marks_correct=4.0 if exam_type != "NEET" else 4.0,
                marks_incorrect=-1.0 if exam_type != "NEET" else -1.0,
                solution_format=ContentFormat.TEXT,
                solution_text=q[6],
            )
            db.add(question)
        db.flush()
        print(f"  ✓ Added {min(25, len(all_questions))} questions to shift {shift.label}")

def _add_more_questions(db):
    """Add more questions to existing shifts"""
    shifts = db.query(Shift).all()
    for shift in shifts[:5]:  # Add to first 5 shifts
        existing_count = db.query(Question).filter(Question.shift_id == shift.id).count()
        if existing_count < 10:
            # Add more questions
            for i in range(existing_count + 1, existing_count + 11):
                question = Question(
                    shift_id=shift.id,
                    subject=SubjectName.PHYSICS if i % 3 == 0 else SubjectName.CHEMISTRY if i % 3 == 1 else SubjectName.MATHS,
                    question_type=QuestionType.MCQ_SINGLE,
                    question_number=i,
                    question_format=ContentFormat.TEXT,
                    question_text=f"Sample question {i} for {shift.label}",
                    option_a="Option A",
                    option_b="Option B",
                    option_c="Option C",
                    option_d="Option D",
                    correct_answer="A" if i % 2 == 0 else "B",
                    marks_correct=4.0,
                    marks_incorrect=-1.0,
                    solution_format=ContentFormat.TEXT,
                    solution_text=f"Solution for question {i}. The correct answer is {'A' if i % 2 == 0 else 'B'}.",
                )
                db.add(question)
            print(f"  ✓ Added 10 more questions to shift {shift.label}")

def _seed_premium_subject(db, subj, subj_name, track_label):
    """Create DPP set, test set with chapters/modules, and mock tests for a subject."""
    chapters_by_subject = {
        SubjectName.PHYSICS:   ["Kinematics","Laws of Motion","Work Energy Power","Rotational Motion","Gravitation","Thermodynamics","Waves","Electrostatics","Current Electricity","Magnetism","Optics","Modern Physics"],
        SubjectName.CHEMISTRY: ["Atomic Structure","Chemical Bonding","States of Matter","Thermodynamics","Equilibrium","Electrochemistry","Organic Chemistry Basics","Hydrocarbons","Coordination Compounds","Biomolecules","Polymers","p-Block Elements"],
        SubjectName.MATHS:     ["Sets and Functions","Trigonometry","Algebra","Coordinate Geometry","Calculus","Vectors","3D Geometry","Probability","Statistics","Matrices","Complex Numbers","Sequences and Series"],
        SubjectName.BIOLOGY:   ["Cell Biology","Genetics","Evolution","Plant Physiology","Human Physiology","Ecology","Reproduction","Biotechnology","Biodiversity","Microbes","Body Fluids","Locomotion"],
    }
    chapters = chapters_by_subject.get(subj_name, ["Chapter 1"])

    # DPP Sets
    for set_num, qcount in enumerate([10, 15], 1):
        dpp_set = DppSet(subject_id=subj.id, name=f"DPP Set {set_num}", questions_per_dpp=qcount)
        db.add(dpp_set); db.flush()
        for i, ch in enumerate(chapters[:6], 1):
            dpp = Dpp(dpp_set_id=dpp_set.id, title=f"DPP {i} – {ch}",
                      chapter_name=ch, order_index=i, duration_minutes=qcount * 2)
            db.add(dpp); db.flush()
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

    # Test Sets
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

    # Mock Tests
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