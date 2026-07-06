# iCARE++ Web

A machine learning-driven clinical competency assessment and adaptive learning system for nursing students at Batangas State University – TNEU ARASOF Nasugbu.

## Prerequisites

- **Node.js** 18.x or later
- **npm** 9.x or later
- Optional: **Backend API** for full functionality

## Installation

1. Navigate to the project directory:
   ```bash
   cd icare-web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.local` and update as needed:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   ```

## Development

Start the development server:

```bash
npm run dev
```

Open in browser: <http://localhost:3000>

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint to check code quality |

## Project Structure

```
icare-web/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Dean/Super Admin portal
│   │   ├── analytics/      # Cohort analytics
│   │   ├── student-management/  # Student management
│   │   ├── rooms/          # Room management
│   │   ├── faculty/        # Faculty management
│   │   ├── users/          # User accounts
│   │   ├── reports/        # Reports & audit logs
│   │   └── settings/       # Admin settings
│   ├── login/              # Authentication
│   ├── dashboard/          # Student dashboard
│   ├── patients/           # Patient management
│   ├── quizzes/            # Adaptive quizzes
│   └── performance/        # Performance tracking
├── backend/                # Python backend (if applicable)
├── public/                 # Static assets
└── package.json           # Dependencies
```

## User Roles

| Role | Portal | Access |
|------|--------|--------|
| **Super Admin (Dean)** | `/admin` | Full system, analytics, user management |
| **Faculty** | `/admin/faculty` | Student monitoring, grading, room oversight |
| **Student** | `/dashboard` | Clinical tasks, quizzes, patient monitoring |

## Key Features

- **ML-Powered Analytics** - Early identification of at-risk students
- **Adaptive Quizzes** - Personalized learning recommendations
- **Clinical Simulation** - Patient vital signs monitoring
- **Role-Based Access Control** - Secure multi-role system
- **Data Privacy Compliance** - Philippine Data Privacy Act 2012

## Design System

- **Primary Color**: `#1B6B7B` (Teal)
- **Safe/Positive**: Emerald
- **At-Risk/Warning**: Rose

## Key Technologies

- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling

## Troubleshooting

### Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
# Or run on different port
npm run dev -- -p 3001
```

### Build errors
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

### TypeScript errors
Check `tsconfig.json` and ensure all dependencies are installed.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Codebase Summary](./CODEBASE_SUMMARY.md) - Technical overview