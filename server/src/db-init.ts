import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function init() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'icare'}\``);
  await conn.query(`USE \`${process.env.DB_NAME || 'icare'}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('student', 'faculty', 'admin') DEFAULT 'student',
      cohort VARCHAR(100) DEFAULT '',
      student_id VARCHAR(100) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      age INT NOT NULL,
      gender ENUM('Male', 'Female') NOT NULL,
      room VARCHAR(20) NOT NULL,
      diagnosis TEXT NOT NULL,
      admitted_date DATE NOT NULL,
      status ENUM('Stable', 'Guarded', 'Critical') DEFAULT 'Stable',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS vital_signs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      timestamp DATETIME NOT NULL,
      heart_rate INT NOT NULL,
      blood_pressure_systolic INT NOT NULL,
      blood_pressure_diastolic INT NOT NULL,
      temperature DECIMAL(4,1) NOT NULL,
      respiration_rate INT NOT NULL,
      oxygen_saturation INT NOT NULL,
      is_anomaly BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS clinical_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      patient_id INT,
      patient_name VARCHAR(255),
      due_date DATETIME NOT NULL,
      status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
      priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
      category VARCHAR(100) DEFAULT '',
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      difficulty ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
      questions_count INT DEFAULT 0,
      completed_count INT DEFAULT 0,
      last_score INT DEFAULT NULL,
      due_date DATE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quiz_id INT NOT NULL,
      text TEXT NOT NULL,
      options JSON NOT NULL,
      correct_index INT NOT NULL,
      explanation TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS ehr_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      date DATETIME NOT NULL,
      type ENUM('progress', 'nursing', 'physician', 'laboratory') NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(255) NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('info', 'warning', 'alert', 'success') DEFAULT 'info',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS performance_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      date DATE NOT NULL,
      category VARCHAR(100) NOT NULL,
      score INT NOT NULL,
      competency VARCHAR(255) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tpr_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      date DATE NOT NULL,
      time VARCHAR(10) NOT NULL,
      temperature DECIMAL(4,1) NOT NULL,
      pulse INT NOT NULL,
      respiration INT NOT NULL,
      signature VARCHAR(255) NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS ivf_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      date DATE NOT NULL,
      time VARCHAR(10) NOT NULL,
      iv_fluids INT DEFAULT 0,
      oral_intake INT DEFAULT 0,
      urine_output INT DEFAULT 0,
      vomitus INT DEFAULT 0,
      drainage INT DEFAULT 0,
      heart_rate INT,
      blood_pressure_systolic INT,
      blood_pressure_diastolic INT,
      temperature DECIMAL(4,1),
      notes TEXT,
      signature VARCHAR(255) NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      type ENUM('quiz', 'task', 'review') DEFAULT 'review',
      priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Database initialized successfully!');
  await conn.end();
}

init().catch(console.error);
