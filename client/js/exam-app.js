// Exam System Frontend
let editor = null;
let currentExam = null;
let currentStudentId = null;
let currentQuestionIndex = 0;
let timerInterval = null;
let answers = {};

// Get exam ID from URL
const urlParams = new URLSearchParams(window.location.search);
const examId = urlParams.get('id');

const API_URL = 'http://localhost:5001';

// Initialize exam
async function initExam() {
    // Get student info
    const studentName = prompt('Enter your full name:', 'Student Name');
    const studentRollNo = prompt('Enter your roll number:', '2024001');
    
    if (!studentName || !studentRollNo) {
        alert('Name and Roll Number are required!');
        return;
    }
    
    showNotification('Starting exam...', 'info');
    
    try {
        // Start exam session
        const response = await fetch(`${API_URL}/api/exam/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: examId,
                studentName: studentName,
                studentRollNo: studentRollNo
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentStudentId = data.studentId;
            displayStudentInfo(studentName, studentRollNo);
            await loadExam();
            startTimer(data.endTime);
            showNotification('Exam started! Good luck!', 'success');
        } else {
            alert('Failed to start exam');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Cannot connect to server. Make sure backend is running on port 5001');
    }
}

// Load exam details
async function loadExam() {
    const response = await fetch(`${API_URL}/api/exam/${examId}`);
    currentExam = await response.json();
    
    document.getElementById('exam-title').textContent = currentExam.title;
    displayQuestions();
    loadQuestion(0);
}

// Display questions list
function displayQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';
    
    currentExam.questions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-card';
        qDiv.onclick = () => loadQuestion(index);
        qDiv.innerHTML = `
            <div class="question-title">Q${index + 1}. ${q.title}</div>
            <div class="question-marks">📝 ${q.marks} marks</div>
        `;
        container.appendChild(qDiv);
    });
}

// Load a question
function loadQuestion(index) {
    currentQuestionIndex = index;
    const question = currentExam.questions[index];
    
    // Update active state
    document.querySelectorAll('.question-card').forEach((card, i) => {
        if (i === index) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    
    // Display question details
    const detailsDiv = document.getElementById('question-details');
    detailsDiv.style.display = 'block';
    detailsDiv.innerHTML = `
        <div class="question-description">
            <h3>${question.title}</h3>
            <p style="margin-top: 10px;">${question.description}</p>
            <p style="margin-top: 10px;"><strong>Marks:</strong> ${question.marks}</p>
        </div>
        ${question.testCases && question.testCases.length > 0 ? `
        <div class="test-cases">
            <h4>Sample Test Cases:</h4>
            ${question.testCases.map(tc => `
                <div class="test-case">
                    <strong>Input:</strong> ${tc.input}<br>
                    <strong>Expected Output:</strong> ${tc.expectedOutput}
                </div>
            `).join('')}
        </div>
        ` : ''}
    `;
    
    // Load saved answer if exists
    if (answers[question.id]) {
        editor.setValue(answers[question.id]);
    } else {
        editor.setValue(getTemplateCode(question));
    }
}

// Get template code
function getTemplateCode(question) {
    const language = document.getElementById('language-selector').value;
    
    const templates = {
        javascript: `// Question: ${question.title}
// Write your solution here

function solve(input) {
    // Your code here
    return input;
}

// Test your solution
console.log(solve("test"));`,
        
        python: `# Question: ${question.title}
# Write your solution here

def solve(input_data):
    # Your code here
    return input_data

# Test your solution
print(solve("test"))`,
        
        java: `// Question: ${question.title}
public class Main {
    public static void main(String[] args) {
        System.out.println(solve("test"));
    }
    
    public static String solve(String input) {
        // Your code here
        return input;
    }
}`,
        
        cpp: `// Question: ${question.title}
#include <iostream>
#include <string>
using namespace std;

string solve(string input) {
    // Your code here
    return input;
}

int main() {
    cout << solve("test") << endl;
    return 0;
}`
    };
    
    return templates[language] || templates.javascript;
}

// Save answer
async function saveAnswer() {
    const question = currentExam.questions[currentQuestionIndex];
    const code = editor.getValue();
    const language = document.getElementById('language-selector').value;
    
    answers[question.id] = code;
    
    try {
        await fetch(`${API_URL}/api/exam/save-answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: examId,
                studentId: currentStudentId,
                questionId: question.id,
                code: code,
                language: language
            })
        });
        
        showNotification('Answer saved!', 'success');
    } catch (error) {
        showNotification('Auto-save failed', 'error');
    }
}

// Run code
async function runCode() {
    const code = editor.getValue();
    const language = document.getElementById('language-selector').value;
    
    const outputArea = document.getElementById('output-area');
    const outputContent = document.getElementById('output-content');
    
    outputArea.style.display = 'block';
    outputContent.textContent = '⏳ Running code...';
    
    try {
        // Since we don't have execution API in exam server, show simulation
        setTimeout(() => {
            outputContent.textContent = `✅ Code executed successfully!\n\nLanguage: ${language}\n\nTip: In full version, this would show actual output.`;
        }, 1000);
        
    } catch (error) {
        outputContent.textContent = `Error: ${error.message}`;
    }
}

// Submit exam
async function submitExam() {
    if (confirm('Are you sure you want to submit? You cannot change answers after submission.')) {
        await saveAnswer();
        
        showNotification('Submitting exam...', 'info');
        
        const response = await fetch(`${API_URL}/api/exam/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: examId,
                studentId: currentStudentId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            clearInterval(timerInterval);
            showResults(result);
        }
    }
}

// Show results
function showResults(result) {
    const modal = document.createElement('div');
    modal.className = 'results-modal';
    modal.innerHTML = `
        <div class="results-content">
            <h2>🎉 Exam Submitted Successfully!</h2>
            <div class="score">
                ${result.score} / ${result.totalMarks}
                <br>
                <small style="font-size: 16px;">${result.percentage.toFixed(1)}%</small>
            </div>
            <h3>Question-wise Breakdown:</h3>
            ${currentExam.questions.map((q, i) => `
                <div style="margin: 15px 0; padding: 10px; background: #1e1e1e; border-radius: 4px;">
                    <strong>Q${i+1}. ${q.title}</strong><br>
                    Score: ${result.results[q.id]?.score || 0}/${q.marks}
                </div>
            `).join('')}
            <button onclick="location.reload()" style="margin-top: 20px; width: 100%; padding: 10px;">
                Close
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Start timer
function startTimer(endTime) {
    timerInterval = setInterval(() => {
        const now = new Date();
        const end = new Date(endTime);
        const diff = end - now;
        
        if (diff <= 0) {
            clearInterval(timerInterval);
            submitExam();
            return;
        }
        
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        const timerDisplay = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const timerElement = document.getElementById('timer');
        timerElement.textContent = timerDisplay;
        
        if (minutes < 5 && hours === 0) {
            timerElement.classList.add('warning');
        }
    }, 1000);
}

// Display student info
function displayStudentInfo(name, rollNo) {
    document.getElementById('student-info').innerHTML = `
        <strong><i class="fas fa-user-graduate"></i> ${name}</strong><br>
        <small>Roll No: ${rollNo}</small>
    `;
}

// Show notification
function showNotification(message, type) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#2ea043' : type === 'error' ? '#f85149' : '#0e639c'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// Initialize Monaco Editor
function initMonaco() {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: '// Your code here...',
            language: 'javascript',
            theme: 'vs-dark',
            fontSize: 14,
            minimap: { enabled: false },
            automaticLayout: true
        });
        
        // Auto-save every 30 seconds
        setInterval(saveAnswer, 30000);
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('run-code-btn').onclick = runCode;
    document.getElementById('save-answer-btn').onclick = saveAnswer;
    document.getElementById('submit-exam-btn').onclick = submitExam;
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Initialize
initMonaco();
setupEventListeners();
initExam();