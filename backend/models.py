from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Boolean
from sqlalchemy.orm import relationship
import datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional, List

from database import Base

# Many-to-many association table for Items and Tags
item_tags = Table(
    'item_tags',
    Base.metadata,
    Column('item_id', Integer, ForeignKey('items.id', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)
)

class Item(Base):
    __tablename__ = 'items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    metadata_title = Column(String, nullable=True)
    filename_title = Column(String, nullable=True)
    type = Column(String, nullable=False)  # 'book', 'series', 'comic', 'graphic_novel', 'chapter'
    path = Column(String, nullable=False, unique=True)
    cover_path = Column(String, nullable=True)
    author = Column(String, nullable=True)
    publisher = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    description = Column(String, nullable=True)
    rating = Column(Integer, nullable=True)  # 1 to 5
    parent_id = Column(Integer, ForeignKey('items.id', ondelete='CASCADE'), nullable=True)
    added_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_read = Column(DateTime, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    
    # Relationships
    children = relationship("Item", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("Item", back_populates="children", remote_side=[id])
    progress = relationship("Progress", back_populates="item", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=item_tags, back_populates="items")

class Progress(Base):
    __tablename__ = 'progress'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey('items.id', ondelete='CASCADE'), nullable=False)
    file_path = Column(String, nullable=False)
    progress_pct = Column(Float, default=0.0)
    current_page = Column(Integer, default=0)
    total_pages = Column(Integer, nullable=True)
    cfi = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    item = relationship("Item", back_populates="progress")

class Tag(Base):
    __tablename__ = 'tags'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    
    items = relationship("Item", secondary=item_tags, back_populates="tags")

class Setting(Base):
    __tablename__ = 'settings'
    
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


# --- Pydantic Schemas ---

class TagBase(BaseModel):
    name: str

class TagCreate(TagBase):
    pass

class TagResponse(TagBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

class ProgressBase(BaseModel):
    file_path: str
    progress_pct: float
    current_page: int
    total_pages: Optional[int] = None
    cfi: Optional[str] = None

class ProgressCreate(ProgressBase):
    pass

class ProgressResponse(ProgressBase):
    id: int
    item_id: int
    updated_at: datetime.datetime
    
    model_config = ConfigDict(from_attributes=True)

class ItemBase(BaseModel):
    title: str
    metadata_title: Optional[str] = None
    filename_title: Optional[str] = None
    type: str
    path: str
    cover_path: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    description: Optional[str] = None
    rating: Optional[int] = None
    parent_id: Optional[int] = None
    last_read: Optional[datetime.datetime] = None
    is_read: bool = False

class ItemCreate(ItemBase):
    pass

class ItemUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    description: Optional[str] = None
    rating: Optional[int] = None
    tags: Optional[List[str]] = None
    is_read: Optional[bool] = None

class ItemResponse(ItemBase):
    id: int
    added_at: datetime.datetime
    tags: List[TagResponse] = []
    progress: List[ProgressResponse] = []
    children_count: Optional[int] = 0
    overall_progress: Optional[float] = 0.0
    
    model_config = ConfigDict(from_attributes=True)

class SettingBase(BaseModel):
    key: str
    value: Optional[str] = None

class SettingResponse(SettingBase):
    model_config = ConfigDict(from_attributes=True)
