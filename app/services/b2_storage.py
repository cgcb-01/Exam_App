import io
import mimetypes
from typing import Optional
from app.config import settings

try:
    from b2sdk.v2 import InMemoryAccountInfo, B2Api, AuthInfoCache
    B2_AVAILABLE = True
except ImportError:
    B2_AVAILABLE = False


class B2Storage:
    _instance = None

    def __init__(self):
        if not B2_AVAILABLE:
            raise RuntimeError("b2sdk not installed. Run: pip install b2sdk")
        info = InMemoryAccountInfo()
        self._api = B2Api(info)
        self._api.authorize_account(
            "production",
            settings.b2_application_key_id,
            settings.b2_application_key,
        )
        self._bucket = self._api.get_bucket_by_name(settings.b2_bucket_name)

    @classmethod
    def get(cls) -> "B2Storage":
        if cls._instance is None:
            cls._instance = B2Storage()
        return cls._instance

    def upload_bytes(
        self,
        data: bytes,
        file_key: str,
        content_type: Optional[str] = None,
    ) -> str:
        """Upload raw bytes. Returns the B2 file key."""
        if content_type is None:
            content_type, _ = mimetypes.guess_type(file_key)
            content_type = content_type or "application/octet-stream"
        self._bucket.upload_bytes(
            data_bytes=data,
            file_name=file_key,
            content_type=content_type,
        )
        return file_key

    def upload_file_obj(self, file_obj: io.BytesIO, file_key: str, content_type: str = "application/octet-stream") -> str:
        data = file_obj.read()
        return self.upload_bytes(data, file_key, content_type)

    def download_bytes(self, file_key: str) -> bytes:
        downloaded = self._bucket.download_file_by_name(file_key)
        buf = io.BytesIO()
        downloaded.save(buf)
        return buf.getvalue()

    def get_download_url(self, file_key: str, valid_seconds: int = 3600) -> str:
        return self._api.get_download_url_for_file_name(
            settings.b2_bucket_name,
            file_key,
        )
        
    def delete_file(self, file_key: str) -> bool:
        try:
            file_version = self._bucket.get_file_info_by_name(file_key)
            self._api.delete_file_version(file_version.id_, file_key)
            return True
        except Exception:
            return False

    @staticmethod
    def exam_pdf_key(exam_id: str, file_type: str = "question_paper") -> str:
        return f"exams/{exam_id}/{file_type}.pdf"

    @staticmethod
    def user_photo_key(user_id: str, ext: str = "jpg") -> str:
        return f"profile_photos/{user_id}/photo.{ext}"

    @staticmethod
    def solution_video_key(question_id: str) -> str:
        return f"solutions/{question_id}/video.mp4"


class LocalStorageStub:
    import os, pathlib

    BASE = "/tmp/aic_b2_stub"

    def upload_bytes(self, data, file_key, content_type=None):
        import pathlib, os
        path = pathlib.Path(self.BASE) / file_key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return file_key

    def download_bytes(self, file_key):
        import pathlib
        return (pathlib.Path(self.BASE) / file_key).read_bytes()

    def get_download_url(self, file_key, valid_seconds=3600):
        return f"/static/stub/{file_key}"

    def delete_file(self, file_key):
        import pathlib
        p = pathlib.Path(self.BASE) / file_key
        if p.exists():
            p.unlink()
        return True

    exam_pdf_key    = staticmethod(B2Storage.exam_pdf_key.__func__)  
    user_photo_key  = staticmethod(B2Storage.user_photo_key.__func__) 
    solution_video_key = staticmethod(B2Storage.solution_video_key.__func__)

def get_storage():
    if settings.b2_application_key_id and B2_AVAILABLE:
        return B2Storage.get()
    return LocalStorageStub()
