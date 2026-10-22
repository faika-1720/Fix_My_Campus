# Fix_My_Campus

A beginner-friendly campus complaint management project built with **Node.js, Express, MySQL, HTML, CSS and JavaScript**.

## What is included?
- Student, Staff and Admin demo logins
- Student can create and track complaints
- Staff can update complaint status
- Admin can view complaints and create user accounts
- Dashboard counts, search, status filter, sample complaints
- Responsive blue-and-white interface
- The app creates its database/tables and inserts demo data automatically on first start

## Before you start
Install:
1. **Node.js LTS** from https://nodejs.org/
2. **MySQL Server** (MySQL Workbench is optional)

Make sure the MySQL service is running.

## Setup (Windows / VS Code)
1. Extract the ZIP.
2. Open the `Fix_My_Campus` folder in VS Code.
3. Open the terminal: **Terminal → New Terminal**.
4. Run:
   ```bash
   npm install
   ```
5. Make a copy of `.env.example` and name the copy `.env`.
6. Open `.env` and set `DB_PASSWORD` to your MySQL root password. If your MySQL root account has no password, leave it empty after `DB_PASSWORD=`.
7. Run:
   ```bash
   npm start
   ```
8. Open **http://localhost:3000** in Chrome or Edge.

> You do **not** need to manually create a database or run `schema.sql`. On startup, the app creates the database, tables, and demo data automatically. The MySQL user must have permission to create a database.

## Demo accounts
Click a demo account on the login screen, or use:

| Role | Email | Password |
|---|---|---|
| Student | `student@fixmycampus.test` | `Student123!` |
| Staff | `staff@fixmycampus.test` | `Staff123!` |
| Admin | `admin@fixmycampus.test` | `Admin123!` |

## Common setup issues
- **`ECONNREFUSED` / can't connect:** Start the MySQL service, then try `npm start` again.
- **`Access denied for user 'root'`:** The password in `.env` is incorrect. Update `DB_PASSWORD`.
- **`npm is not recognized`:** Install Node.js LTS, close VS Code, reopen it, and try again.
- **Port 3000 is busy:** Change `PORT=3000` in `.env` to `PORT=3001`, restart, and open `http://localhost:3001`.
- If you change `.env`, stop the server with `Ctrl+C` and run `npm start` again.

## Project structure
```text
Fix_My_Campus/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Notes
- This is an academic/demo project, not production-hardened software.
- Demo passwords are for local demonstration only. Change them before any real deployment.
- Keep `.env` private; do not upload it to GitHub.
