require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const DB_NAME = (process.env.DB_NAME || "fix_my_campus").replace(/[^a-zA-Z0-9_]/g, "");
const JWT_SECRET = process.env.JWT_SECRET || "development_only_change_me";

let pool;

async function setupDatabase() {
  // Connect without selecting a database first so the app can create it automatically.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();

  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('student','staff','admin') NOT NULL DEFAULT 'student',
      department VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      description TEXT NOT NULL,
      category ENUM('Infrastructure','Electrical','Cleanliness','Wi-Fi / IT','Water Supply','Other') NOT NULL DEFAULT 'Other',
      location VARCHAR(150) NOT NULL,
      priority ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
      status ENUM('Submitted','In Progress','Resolved','Rejected') NOT NULL DEFAULT 'Submitted',
      student_id INT NOT NULL,
      assigned_to INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_complaint_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_complaint_staff FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  const [existing] = await pool.query("SELECT COUNT(*) AS total FROM users");
  if (existing[0].total === 0) {
    const demoUsers = [
      ["Demo Student", "student@fixmycampus.test", "Student123!", "student", "Computer Engineering"],
      ["Demo Staff", "staff@fixmycampus.test", "Staff123!", "staff", "Maintenance"],
      ["Demo Admin", "admin@fixmycampus.test", "Admin123!", "admin", "Administration"]
    ];
    for (const u of demoUsers) {
      const hash = await bcrypt.hash(u[2], 10);
      await pool.query(
        "INSERT INTO users (name,email,password_hash,role,department) VALUES (?,?,?,?,?)",
        [u[0], u[1], hash, u[3], u[4]]
      );
    }
    const [studentRows] = await pool.query("SELECT id FROM users WHERE email = ?", ["student@fixmycampus.test"]);
    const [staffRows] = await pool.query("SELECT id FROM users WHERE email = ?", ["staff@fixmycampus.test"]);
    await pool.query(
      "INSERT INTO complaints (title,description,category,location,priority,status,student_id,assigned_to) VALUES " +
      "(?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?)",
      [
        "Projector not working", "The projector in the classroom is not turning on.", "Electrical", "Room 204", "Medium", "Submitted", studentRows[0].id, null,
        "Water leakage near washroom", "There is water leakage near the second-floor washroom.", "Water Supply", "Second floor", "High", "In Progress", studentRows[0].id, staffRows[0].id,
        "Wi-Fi connection issue", "Campus Wi-Fi disconnects frequently in the library.", "Wi-Fi / IT", "Library", "Low", "Resolved", studentRows[0].id, staffRows[0].id
      ]
    );
  }
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Please log in first." });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "You do not have permission for this action." });
      }
      next();
    } catch {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Fix_My_Campus" }));

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ message: "Enter email and password." });
    const [rows] = await pool.query("SELECT id,name,email,password_hash,role,department FROM users WHERE email = ?", [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }
    const user = rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, department: user.department }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department } });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Could not log in. Check that MySQL is running and .env is correct." });
  }
});

app.get("/api/me", auth(), (req, res) => res.json({ user: req.user }));

app.get("/api/dashboard", auth(), async (req, res) => {
  try {
    const { id, role } = req.user;
    let where = "";
    let params = [];
    if (role === "student") { where = "WHERE student_id = ?"; params = [id]; }
    else if (role === "staff") { where = "WHERE assigned_to = ? OR status = 'Submitted'"; params = [id]; }

    const [rows] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'Submitted') AS submitted,
        SUM(status = 'In Progress') AS inProgress,
        SUM(status = 'Resolved') AS resolved,
        SUM(status = 'Rejected') AS rejected
       FROM complaints ${where}`, params
    );
    res.json({ stats: rows[0] });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ message: "Could not load dashboard." });
  }
});

app.get("/api/complaints", auth(), async (req, res) => {
  try {
    const { id, role } = req.user;
    let sql = `
      SELECT c.*, s.name AS student_name, s.email AS student_email, st.name AS staff_name
      FROM complaints c
      JOIN users s ON c.student_id = s.id
      LEFT JOIN users st ON c.assigned_to = st.id
    `;
    const params = [];
    if (role === "student") { sql += " WHERE c.student_id = ?"; params.push(id); }
    if (role === "staff") { sql += " WHERE c.assigned_to = ? OR c.status = 'Submitted'"; params.push(id); }
    sql += " ORDER BY c.created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json({ complaints: rows });
  } catch (err) {
    console.error("Complaints error:", err.message);
    res.status(500).json({ message: "Could not load complaints." });
  }
});

app.post("/api/complaints", auth(["student"]), async (req, res) => {
  try {
    const { title, description, category, location, priority } = req.body;
    const allowedCategories = ["Infrastructure", "Electrical", "Cleanliness", "Wi-Fi / IT", "Water Supply", "Other"];
    const allowedPriorities = ["Low", "Medium", "High"];
    if (!title || !description || !location) return res.status(400).json({ message: "Title, description and location are required." });
    if (String(title).length > 150) return res.status(400).json({ message: "Title must be 150 characters or less." });
    const safeCategory = allowedCategories.includes(category) ? category : "Other";
    const safePriority = allowedPriorities.includes(priority) ? priority : "Medium";
    const [result] = await pool.query(
      "INSERT INTO complaints (title,description,category,location,priority,student_id) VALUES (?,?,?,?,?,?)",
      [String(title).trim(), String(description).trim(), safeCategory, String(location).trim(), safePriority, req.user.id]
    );
    res.status(201).json({ message: "Complaint submitted successfully.", id: result.insertId });
  } catch (err) {
    console.error("Create complaint error:", err.message);
    res.status(500).json({ message: "Could not submit complaint." });
  }
});

app.patch("/api/complaints/:id", auth(["staff", "admin"]), async (req, res) => {
  try {
    const status = String(req.body.status || "");
    const allowed = ["Submitted", "In Progress", "Resolved", "Rejected"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Choose a valid status." });
    const complaintId = Number(req.params.id);
    if (!Number.isInteger(complaintId) || complaintId < 1) return res.status(400).json({ message: "Invalid complaint ID." });
    if (req.user.role === "staff") {
      await pool.query(
        "UPDATE complaints SET status = ?, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?",
        [status, req.user.id, complaintId]
      );
    } else {
      const assignedTo = req.body.assigned_to ? Number(req.body.assigned_to) : null;
      if (assignedTo) {
        const [staff] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'staff'", [assignedTo]);
        if (!staff.length) return res.status(400).json({ message: "Selected staff member does not exist." });
        await pool.query("UPDATE complaints SET status = ?, assigned_to = ? WHERE id = ?", [status, assignedTo, complaintId]);
      } else {
        await pool.query("UPDATE complaints SET status = ? WHERE id = ?", [status, complaintId]);
      }
    }
    res.json({ message: "Complaint updated." });
  } catch (err) {
    console.error("Update complaint error:", err.message);
    res.status(500).json({ message: "Could not update complaint." });
  }
});

app.get("/api/staff", auth(["admin"]), async (_req, res) => {
  const [rows] = await pool.query("SELECT id,name,email,department FROM users WHERE role = 'staff' ORDER BY name");
  res.json({ staff: rows });
});

app.get("/api/users", auth(["admin"]), async (_req, res) => {
  const [rows] = await pool.query("SELECT id,name,email,role,department,created_at FROM users ORDER BY created_at DESC");
  res.json({ users: rows });
});

app.post("/api/users", auth(["admin"]), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "");
    const department = String(req.body.department || "").trim();
    if (!name || !email || !password || !["student", "staff", "admin"].includes(role)) {
      return res.status(400).json({ message: "Name, valid email, password and role are required." });
    }
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (name,email,password_hash,role,department) VALUES (?,?,?,?,?)", [name,email,hash,role,department || null]);
    res.status(201).json({ message: "User created successfully." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "That email is already registered." });
    console.error("Create user error:", err.message);
    res.status(500).json({ message: "Could not create user." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

setupDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nFix_My_Campus is running: http://localhost:${PORT}`);
      console.log("Demo accounts: student@fixmycampus.test / Student123!");
      console.log("               staff@fixmycampus.test / Staff123!");
      console.log("               admin@fixmycampus.test / Admin123!\n");
    });
  })
  .catch((err) => {
    console.error("\nCould not start Fix_My_Campus.");
    console.error("Check MySQL is installed and running, and .env has the correct DB credentials.");
    console.error("Details:", err.message);
    process.exit(1);
  });
