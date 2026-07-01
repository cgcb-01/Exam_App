import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title        = Column(String(300), nullable=False)
    exam_type    = Column(
        SAEnum("PAIC","BAIC","DPP","CHAPTERWISE","PYQ","PERSONALISED",
               name="exam_type_enum"),
        nullable=False
    )
    paper_style  = Column(
        SAEnum("JEE_MAINS","JEE_ADV","NEET","GENERIC", name="paper_style_enum"),
        default="GENERIC"
    )
    stream       = Column(SAEnum("JEE","NEET","BOTH", name="stream_exam_enum"), default="BOTH")
    for_class    = Column(SAEnum("Class 11","Class 12","Dropper","ALL", name="class_exam_enum"), default="ALL")
    subject      = Column(String(50), nullable=True)   
    duration_minutes = Column(Integer, default=180)
    start_time       = Column(DateTime, nullable=True)
    end_time         = Column(DateTime, nullable=True)

    is_premium   = Column(Boolean, default=False)
    is_active    = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)

    instructions     = Column(Text, nullable=True)
    year             = Column(Integer, nullable=True)  
    shift            = Column(String(20), nullable=True)
    paper_no         = Column(String(10), nullable=True)
    module_no        = Column(Integer, nullable=True) 
    chapter_id       = Column(String(36), ForeignKey("chapters.id"), nullable=True)
    dpp_date         = Column(DateTime, nullable=True)
    solution_released= Column(Boolean, default=False)
    solution_release_time = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sections    = relationship("ExamSection", back_populates="exam",
                               order_by="ExamSection.order_index", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="exam")
    chapter     = relationship("Chapter", back_populates="exams")


class ExamSection(Base):
    __tablename__ = "exam_sections"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id       = Column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    title         = Column(String(200), nullable=False)
    question_type = Column(SAEnum("MCQ","MULTI","NUMERICAL","INTEGER","MATCH",
                                  name="qtype_enum"), default="MCQ")
    order_index   = Column(Integer, default=0)

    marks_correct     = Column(Float, default=4.0)
    marks_wrong       = Column(Float, default=-1.0)
    marks_partial     = Column(Float, default=0.0)  
    marks_unattempted = Column(Float, default=0.0)

    max_questions_to_attempt = Column(Integer, nullable=True) 

    exam      = relationship("Exam", back_populates="sections")
    questions = relationship("Question", back_populates="section",
                             order_by="Question.order_index", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    section_id    = Column(String(36), ForeignKey("exam_sections.id", ondelete="CASCADE"), index=True)
    order_index   = Column(Integer, default=0)

    content       = Column(JSON, nullable=False)          
    solution      = Column(JSON, nullable=True)       
    solution_video_url = Column(String(500), nullable=True)

    correct_answer  = Column(JSON, nullable=False)
    numerical_range = Column(JSON, nullable=True) 
    difficulty      = Column(SAEnum("Easy","Medium","Hard", name="diff_enum"), nullable=True)
    topic_tags      = Column(JSON, nullable=True)         
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    section = relationship("ExamSection", back_populates="questions")
    options = relationship("QuestionOption", back_populates="question",
                           order_by="QuestionOption.option_label", cascade="all, delete-orphan")


class QuestionOption(Base):
    __tablename__ = "question_options"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id  = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    option_label = Column(String(5), nullable=False)  
    content      = Column(JSON, nullable=False)         
    is_correct   = Column(Boolean, default=False)       
    question = relationship("Question", back_populates="options")
