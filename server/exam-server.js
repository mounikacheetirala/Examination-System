import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = promisify(exec);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite Database - PERSISTENT (no DROP)
const dbPath = path.join(__dirname, 'exam_system.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Create tables ONLY IF THEY DON'T EXIST (no DROP)
console.log('Initializing database...');

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
        answers_json TEXT,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_students_exam ON students(exam_id);
`);

// Insert default teacher if not exists
const teacherExists = db.prepare("SELECT * FROM teachers WHERE id = ?").get('teacher_001');
if (!teacherExists) {
    db.prepare(`INSERT INTO teachers (id, name, password) VALUES (?, ?, ?)`).run('teacher_001', 'Admin Teacher', 'teacher123');
    console.log('✅ Default teacher created');
}

console.log('✅ Database initialized successfully (persistent storage)');

// ============ TEACHER AUTH ============
app.post('/api/teacher/login', (req, res) => {
    const { password } = req.body;
    const teacher = db.prepare('SELECT * FROM teachers WHERE password = ?').get(password);
    
    if (teacher) {
        res.json({ success: true, token: uuidv4(), teacher: { id: teacher.id, name: teacher.name } });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// ============ CODE EXECUTION ============
app.post('/api/execute-code', async (req, res) => {
    const { code, language } = req.body;
    const timestamp = Date.now();
    let filename = '';
    let command = '';
    
    try {
        switch(language) {
            case 'javascript':
                filename = `temp_${timestamp}.js`;
                fs.writeFileSync(filename, code);
                command = `node "${filename}"`;
                break;
            case 'python':
                filename = `temp_${timestamp}.py`;
                fs.writeFileSync(filename, code);
                command = `python "${filename}"`;
                break;
            case 'java':
                filename = 'Main.java';
                fs.writeFileSync(filename, code);
                command = `javac "${filename}" && java Main`;
                break;
            case 'cpp':
                filename = `temp_${timestamp}.cpp`;
                fs.writeFileSync(filename, code);
                command = `g++ "${filename}" -o temp_${timestamp} && ./temp_${timestamp}`;
                break;
            default:
                throw new Error('Language not supported');
        }
        
        const { stdout, stderr } = await execPromise(command, { timeout: 10000 });
        
        try { if (fs.existsSync(filename)) fs.unlinkSync(filename); } catch(e) {}
        if (language === 'java' && fs.existsSync('Main.class')) fs.unlinkSync('Main.class');
        
        res.json({ success: true, output: stdout || stderr || 'Code executed successfully' });
    } catch (error) {
        res.json({ success: false, output: `Error: ${error.message}` });
    }
});

// ============ EXAM MANAGEMENT ============

// Create exam
app.post('/api/exam/create', (req, res) => {
    const { title, duration, questions, examPassword } = req.body;
    const examId = uuidv4();
    
    try {
        db.prepare(`INSERT INTO exams (id, title, duration, password, teacher_id) VALUES (?, ?, ?, ?, ?)`)
            .run(examId, title, parseInt(duration), examPassword, 'teacher_001');
        
        for (const q of questions) {
            const questionId = uuidv4();
            db.prepare(`INSERT INTO questions (id, exam_id, title, description, marks, difficulty) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(questionId, examId, q.title, q.description, q.marks, q.difficulty);
            
            for (const tc of (q.testCases || [])) {
                db.prepare(`INSERT INTO test_cases (id, question_id, input, expected_output, description, marks) VALUES (?, ?, ?, ?, ?, ?)`)
                    .run(uuidv4(), questionId, tc.input, tc.expectedOutput, tc.description, tc.marks || 0);
            }
        }
        
        res.json({ success: true, examId, examLink: `http://localhost:3001/exam.html?id=${examId}` });
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get exam info
app.get('/api/exam/:examId/info', (req, res) => {
    const exam = db.prepare('SELECT id, title, duration FROM exams WHERE id = ?').get(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
});

// Verify exam and start
app.post('/api/exam/verify', (req, res) => {
    const { examId, password, studentName, studentRollNo } = req.body;
    
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.password !== password) return res.status(401).json({ error: 'Invalid password' });
    
    let student = db.prepare('SELECT * FROM students WHERE exam_id = ? AND name = ? AND roll_no = ?').get(examId, studentName, studentRollNo);
    
    if (student && student.submitted === 1) {
        return res.status(400).json({ error: 'You have already submitted this exam' });
    }
    
    let studentId, endTime;
    
    if (!student) {
        studentId = uuidv4();
        const startTime = new Date();
        endTime = new Date(startTime.getTime() + (exam.duration * 60000));
        
        db.prepare(`INSERT INTO students (id, name, roll_no, exam_id, start_time, end_time, submitted) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(studentId, studentName, studentRollNo, examId, startTime.toISOString(), endTime.toISOString(), 0);
    } else {
        studentId = student.id;
        endTime = new Date(student.end_time);
    }
    
    const questions = db.prepare(`
        SELECT q.*, json_group_array(json_object('input', tc.input, 'expectedOutput', tc.expected_output)) as test_cases
        FROM questions q LEFT JOIN test_cases tc ON q.id = tc.question_id
        WHERE q.exam_id = ? GROUP BY q.id
    `).all(examId);
    
    const formattedQuestions = questions.map(q => ({
        id: q.id, title: q.title, description: q.description, marks: q.marks,
        difficulty: q.difficulty,
        testCases: (() => { try { return JSON.parse(q.test_cases).filter(tc => tc.input); } catch { return []; } })()
    }));
    
    res.json({ 
        success: true, 
        studentId, 
        exam: { id: exam.id, title: exam.title, duration: exam.duration, questions: formattedQuestions }, 
        endTime: endTime.toISOString() 
    });
});

// Save answer
app.post('/api/exam/save-answer', (req, res) => {
    const { studentId, questionId, code, language } = req.body;
    
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    let answers = {};
    try { answers = JSON.parse(student.answers_json || '{}'); } catch(e) {}
    
    answers[questionId] = { code, language, savedAt: new Date().toISOString() };
    db.prepare(`UPDATE students SET answers_json = ? WHERE id = ?`).run(JSON.stringify(answers), studentId);
    
    res.json({ success: true });
});

// Submit exam
app.post('/api/exam/submit', async (req, res) => {
    const { examId, studentId } = req.body;
    
    const student = db.prepare('SELECT * FROM students WHERE id = ? AND exam_id = ?').get(studentId, examId);
    if (!student || student.submitted === 1) return res.status(400).json({ error: 'Already submitted' });
    
    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(examId);
    let answers = {};
    try { answers = JSON.parse(student.answers_json || '{}'); } catch(e) {}
    
    let totalScore = 0;
    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const results = [];
    
    for (const question of questions) {
        const answer = answers[question.id];
        let score = 0;
        
        if (answer && answer.code) {
            const testCases = db.prepare('SELECT * FROM test_cases WHERE question_id = ?').all(question.id);
            for (const tc of testCases) {
                try {
                    const result = await executeAndTest(answer.code, answer.language, tc.input, tc.expected_output);
                    if (result.passed) score += (question.marks / (testCases.length || 1));
                } catch(e) {}
            }
        }
        
        totalScore += score;
        results.push({ questionId: question.id, title: question.title, score: score, maxScore: question.marks });
    }
    
    db.prepare(`UPDATE students SET submitted = 1, submitted_at = CURRENT_TIMESTAMP, total_score = ? WHERE id = ?`)
        .run(totalScore, studentId);
    
    res.json({ success: true, score: totalScore, totalMarks, percentage: ((totalScore / totalMarks) * 100).toFixed(1), results });
});

// Get exam results
app.get('/api/exam/:examId/results', (req, res) => {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    
    const students = db.prepare('SELECT name, roll_no, total_score, submitted, submitted_at FROM students WHERE exam_id = ? ORDER BY submitted_at DESC').all(exam.id);
    const stats = {
        totalStudents: students.length,
        submittedCount: students.filter(s => s.submitted === 1).length,
        averageScore: students.filter(s => s.submitted === 1).reduce((sum, s) => sum + (s.total_score || 0), 0) / (students.filter(s => s.submitted === 1).length || 1),
        highestScore: Math.max(...students.filter(s => s.submitted === 1).map(s => s.total_score || 0), 0)
    };
    
    res.json({ examTitle: exam.title, statistics: stats, students });
});

// Get all exams
app.get('/api/teacher/exams', (req, res) => {
    const exams = db.prepare('SELECT e.*, COUNT(s.id) as student_count FROM exams e LEFT JOIN students s ON e.id = s.exam_id GROUP BY e.id ORDER BY e.created_at DESC').all();
    res.json({ exams });
});

async function executeAndTest(code, language, input, expectedOutput) {
    const timestamp = Date.now();
    let filename = '';
    let command = '';
    
    try {
        if (language === 'python') {
            filename = `test_${timestamp}.py`;
            fs.writeFileSync(filename, code);
            command = `python "${filename}"`;
        } else if (language === 'javascript') {
            filename = `test_${timestamp}.js`;
            fs.writeFileSync(filename, code);
            command = `node "${filename}"`;
        } else {
            return { passed: false, output: 'Language not supported' };
        }
        
        const { stdout } = await execPromise(command, { timeout: 5000 });
        try { if (fs.existsSync(filename)) fs.unlinkSync(filename); } catch(e) {}
        
        return { passed: (stdout.trim() === expectedOutput.trim()), output: stdout };
    } catch (error) {
        return { passed: false, output: error.message };
    }
}

app.listen(PORT, () => {
    console.log(`\n📚 Exam System Server Running on http://localhost:${PORT}`);
    console.log(`🔐 Teacher Password: teacher123`);
    console.log(`💾 Database: ${dbPath} (PERSISTENT - data survives restart)\n`);
});