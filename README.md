# Goal Tracking Portal

Local development notes

- Start backend:

```bash
cd backend
npm install
npm run dev
```

- Environment: copy `.env.example` to `.env` and update values.

- Frontend: served statically by backend. Open http://localhost:3000/

Features added in finalization:
- Analytics endpoints: QoQ, heatmap, distribution, manager-effectiveness, CSV export
- Escalation/reminder services extracted to `backend/services/escalationService.js`
- Daily scheduler (02:00) runs escalation and reminder jobs via `node-cron`
- Admin UI charts (Chart.js) and improved UX polish
# Goal Tracking Portal

A comprehensive, full-stack web application designed to help users set, track, and achieve their personal and professional goals. The platform offers features for managing goals, tracking progress through check-ins, and sharing goals with others for accountability.

## 🚀 Features

*   **User Authentication**: Secure user login system utilizing session management.
*   **Goal Management**: Create, read, update, and delete (CRUD) personal goals.
*   **Progress Tracking**: Regular check-ins to monitor and log progress on active goals.
*   **Manager Reviews**: Managers can approve goals, request rework, and leave feedback.
*   **Admin / HR Controls**: Configure active cycles, view organization data, and unlock goals for revision.
*   **Goal Sharing**: Share goals with other users to build a sense of community and foster accountability.
*   **Responsive UI**: A modern, responsive frontend built with HTML, CSS, and Vanilla JavaScript.
*   **RESTful API**: A robust Node.js/Express backend providing seamless data interaction.

## 🛠 Tech Stack

**Frontend:**
*   HTML5
*   CSS3
*   Vanilla JavaScript (ES6+)

**Backend:**
*   Node.js
*   Express.js
*   SQLite3 (Database)
*   bcryptjs (Password hashing)
*   express-session (Session management)

## 📁 Project Structure

```text
goal-tracking-portal/
├── backend/                # Node.js Express server
│   ├── middleware/         # Custom Express middleware (e.g., auth guards)
│   ├── routes/             # API route definitions (auth, goals, checkins, sharedGoals)
│   ├── database.js         # SQLite database connection and initialization
│   ├── server.js           # Express application entry point
│   ├── package.json        # Backend dependencies and scripts
│   └── goal_tracking.db    # SQLite database file (generated upon running)
└── frontend/               # Client-side application
    ├── index.html          # Main HTML entry point
    ├── styles.css          # Application styling
    └── app.js              # Frontend logic and API integration
```

## ⚙️ Prerequisites

Before you begin, ensure you have met the following requirements:
*   You have installed the latest version of [Node.js](https://nodejs.org/en/) and npm.
*   You have a basic understanding of running terminal commands.

## 🚀 Installation & Setup

Follow these steps to get the project up and running on your local machine.

### 1. Clone the repository (if applicable)
```bash
git clone <repository-url>
cd goal-tracking-portal
```

### 2. Backend Setup
Navigate to the backend directory and install the required dependencies:
```bash
cd backend
npm install
```

Start the backend server:
```bash
# For development with auto-restart (nodemon)
npm run dev

# Or for standard start
npm start
```
The backend server will typically start on `http://localhost:3000` (or the port defined in your environment variables). The SQLite database (`goal_tracking.db`) will be automatically initialized and seeded if necessary.

### 3. Frontend Setup
The frontend is built with vanilla web technologies, so no complex build step or package manager is required for the client side.

To run the frontend, simply serve the `frontend` directory using any local web server. For example, if you have Python installed, you can run:

```bash
cd ../frontend
# For Python 3
python -m http.server 8000
```
Then, open your browser and navigate to `http://localhost:8000`.

*Alternatively, you can use VS Code extensions like "Live Server" to serve the `index.html` file.*

## 🔌 API Reference (Overview)

The backend provides the following RESTful endpoints:

*   **Authentication (`/api/auth`)**:
    *   `POST /register`: Register a new user.
    *   `POST /login`: Authenticate a user and create a session.
    *   `POST /logout`: Terminate the user session.
*   **Goals (`/api/goals`)**:
    *   `GET /`: Retrieve all goals for the authenticated user.
    *   `POST /`: Create a new goal.
    *   `PUT /:id`: Update an existing goal.
    *   `DELETE /:id`: Delete a goal.
*   **Check-ins (`/api/checkins`)**:
    *   `GET /:goalId`: Get check-ins for a specific goal.
    *   `POST /`: Add a new check-in.
*   **Shared Goals (`/api/shared-goals`)**:
    *   `GET /`: View goals shared with the authenticated user.
    *   `POST /`: Share a goal with another user.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the issues page if you want to contribute.

## 📝 License

This project is licensed under the MIT License.
