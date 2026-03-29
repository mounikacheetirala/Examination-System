// Database setup - Persistent storage
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database file
const db = new Database(path.join(__dirname, 'exam_system.db'));

// Create tables
db.exec(`
    -- Teachers table
    CREATE TABLE IF NOT EXISTS teachers (
        id TEXT PRIMARY KEY,
        name TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Exams table
    CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        duration INTEGER NOT NULL,
        password TEXT NOT NULL,
        teacher_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    );
    
    -- Questions table
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        marks INTEGER DEFAULT 10,
        difficulty TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );
    
    -- Test cases table
    CREATE TABLE IF NOT EXISTS test_cases (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        input TEXT,
        expected_output TEXT,
        description TEXT,
        marks INTEGER DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
    
    -- Students table
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        roll_no TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        start_time DATETIME,
        end_time DATETIME,
        submitted_at DATETIME,
        submitted INTEGER DEFAULT 0,
        total_score REAL DEFAULT 0,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );
    
    -- Answers table
    CREATE TABLE IF NOT EXISTS answers (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        code TEXT,
        language TEXT,
        score REAL DEFAULT 0,
        feedback TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
    
    -- Create indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_students_exam ON students(exam_id);
    CREATE INDEX IF NOT EXISTS idx_answers_student ON answers(student_id);
    
    -- Insert default teacher if not exists
    INSERT OR IGNORE INTO teachers (id, name, password)
    VALUES ('teacher_001', 'Admin Teacher', 'teacher123');
`);

console.log('✅ Database initialized successfully');

export { db };