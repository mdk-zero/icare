# iCARE++ Codebase Documentation

## Overview

**iCARE++** is a scalable machine learning-driven clinical competency assessment and adaptive learning system for nursing students at Batangas State University – TNEU ARASOF Nasugbu.

This document provides a comprehensive summary of the current codebase state.

---

## Project Structure

```
icare-web/
├── app/
│   ├── admin/           # Admin/Dean portal (Super Admin)
│   ├── login/           # Authentication page
│   ├── dashboard/       # Student dashboard
│   ├── patients/        # Patient management (Student)
│   ├── quizzes/         # Quiz/Assessment (Student)
│   ├── performance/     # Performance tracking (Student)
│   ├── lib/
│   │   └── api.ts       # API utilities and interfaces
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home/Landing page
├── public/              # Static assets (logos, images)
└── docs/
    └── Full Manuscript.docx  # Project documentation
```

---

## User Roles

| Role | Description | Portal |
|------|-------------|--------|
| **Super Administrator (Dean)** | Full system access, user management, analytics, data privacy compliance | `/admin` |
| **Faculty** | Student management, grading, performance monitoring, room oversight | `/admin/faculty` |
| **Student** | Clinical tasks, quizzes, patient monitoring, learning recommendations | `/dashboard` |

---

## Color Palette

The application uses a cohesive teal-based color scheme aligned with the brand color `#1B6B7B`:

| Usage | Color |
|-------|-------|
| Primary Brand | `#1B6B7B` (Teal) |
| Primary Hover | `#145a63` (Dark Teal) |
| Safe/Positive | `emerald-600` |
| At-Risk/Warning | `rose-600` |
| Background | White / Gray |
| Text | Gray scale |

---

## Pages Summary

### Authentication

#### `/app/login/page.tsx`
- Multi-portal login page
- Features showcase (Student, Faculty, Admin, ML Analytics)
- Email/password authentication
- Redirects based on user role
- Uses `lib/api.ts` for authentication

---

### Student Portal

#### `/app/dashboard/page.tsx`
- Student landing page after login

#### `/app/patients/page.tsx`
- Patient list management
- Vital signs monitoring
- Clinical simulation records

#### `/app/quizzes/page.tsx`
- Adaptive quiz system
- Question display with options
- Competency-based assessments

#### `/app/performance/page.tsx`
- Personal performance tracking
- Quiz scores and history

---

### Admin Portal (Dean/Super Admin)

#### `/app/admin/layout.tsx`
- Admin sidebar navigation with teal (#1B6B7B) scrollbar
- Navigation items: Overview, Students, Analytics, Reports, Rooms, Faculty, Users
- User dropdown with logout functionality

#### `/app/admin/page.tsx` (Overview)
- Welcome banner with Admin badge and Academic Year
- **Stats Cards**: Total Students, At-Risk Students, Average Score, Quizzes Completed
- **Weekly Activity Heatmap**: Visual activity tracking
- **Quick Actions**: Links to enroll student, generate report, view analytics, manage rooms
- **Recent Activity**: Timeline of user actions
- **Room Capacity**: Progress bars showing occupancy
- **Quiz Performance Trend**: 12-week bar chart
- **Student Distribution**: Donut chart (Safe vs At-Risk) using teal and rose
- **Students Requiring Attention**: List of at-risk students with rose theme

#### `/app/admin/student-management/page.tsx`
- Student list with search and filtering
- Stats: Total Students, Safe Students (emerald), At Risk (rose), Total Quizzes
- Table columns: Student info, Quizzes completed (progress bar), Average Score, Status, Last Active
- Sorting functionality
- Enroll Student button

#### `/app/admin/analytics/page.tsx`
- **Header**: Academic year filter, Export Report button
- **Stats Cards**: Total Students (8), At-Risk (3), Active Rooms (8), Avg Score (82%)
- **Weekly Quiz Performance**: Bar chart with hover tooltips
- **Score Distribution**: Area chart
- **Student Performance by Room**: 8 rooms with progress bars, student counts, trend indicators
- **At-Risk Student Trends**: 8-week mini chart
- **Competency Assessment Summary**: Full table with pass rates and trends
- Uses emerald for positive, rose for negative

#### `/app/admin/rooms/page.tsx`
- Room management interface

#### `/app/admin/faculty/page.tsx`
- Faculty management interface

#### `/app/admin/users/page.tsx`
- User account management
- Roles: student, faculty, administrator, super_admin

#### `/app/admin/reports/page.tsx`
- Report generation
- Activity Log (audit trail)
- Competency reports

#### `/app/admin/settings/page.tsx` (Dean Settings)
- **Profile**: Dean profile with Super Administrator role
- **Access Control**: RBAC configuration, security settings (password policy, 2FA)
- **Data Privacy**: Philippine Data Privacy Act compliance status (Data Protection, Access Control, Audit Trail)
- **Notifications**: Admin alert preferences (enrollment, at-risk, assessment deadlines, etc.)

---

## API Structure (`/app/lib/api.ts`)

### Interfaces
- `User` - id, email, name, role (student/faculty/admin)
- `Patient` - id, name, age, gender, room_number, diagnosis, vital_signs
- `Quiz` - id, title, description, difficulty, category
- `Question` - id, quiz_id, content, options, correct_answer, explanation, competencies
- `PerformanceLog` - id, user_id, quiz_id, score, time_taken, answers, created_at

### Functions
- `login(email, password)` - Authenticate user
- `register(email, password, name, role)` - Create new account
- `logout()` - Clear session
- `getCurrentUser()` - Get logged in user
- `isAuthenticated()` - Check auth status
- `fetchPatients()` - Get all patients
- `fetchQuizzes()` - Get all quizzes
- `fetchQuizQuestions(quizId)` - Get quiz questions
- `submitPerformance(userId, quizId, score, timeTaken, answers)` - Save performance
- `fetchStudentPerformance(studentId)` - Get student performance history

---

## Key Features from Manuscript

Based on the project manuscript, the key functionalities for the Dean (Super Admin) include:

1. **User Account Provisioning** - Create and manage user accounts
2. **Role-Based Access Control** - Configure permissions for Student, Faculty, Admin roles
3. **Cohort-Level Analytics** - View analytics across all students
4. **At-Risk Student Reports** - Identify and monitor struggling students
5. **Comprehensive Audit Log** - Track all system activities
6. **Room Management** - Manage clinical simulation rooms
7. **Data Privacy Compliance** - Philippine Data Privacy Act of 2012 compliance

---

## Technical Notes

- **Framework**: Next.js with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks (useState, useEffect)
- **Authentication**: Local storage-based session management
- **API**: REST API (expects backend at `NEXT_PUBLIC_API_URL` or `localhost:5000/api`)
- **Fonts**: Geist Sans, Geist Mono, Rubik Mono One

---

## Current Data (Mock)

### Students (8 total)
- 5 Safe (62.5%)
- 3 At-Risk (37.5%)

### Rooms (8 total)
- All Active

### Faculty (5 total)
- 4 Active, 1 Inactive

---

*Generated: April 2026*
*Version: 1.0*