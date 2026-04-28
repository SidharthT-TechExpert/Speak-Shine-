import { useState, useEffect } from "react";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

export default function AttendancePanel() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({}); // phone → status map
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load students and attendance for selected date
  useEffect(() => {
    loadStudentsAndAttendance();
  }, [selectedDate]);

  const loadStudentsAndAttendance = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load all students
      const usersRes = await api.get("/users");
      const allStudents = usersRes.data;
      setStudents(allStudents);

      // Load attendance for selected date
      const dateStr = selectedDate.toISOString().split("T")[0];
      const attendanceRes = await api.get(`/attendance/date/${dateStr}`);
      
      // Build attendance map: phone → status
      const attendanceMap = {};
      attendanceRes.data.records.forEach((record) => {
        attendanceMap[record.studentPhone] = record.status;
      });
      setAttendance(attendanceMap);
      
    } catch (err) {
      console.error("Failed to load attendance data:", err);
      setError(err.response?.data?.error || "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = async (phone, newStatus) => {
    // Optimistic update
    const previousStatus = attendance[phone];
    setAttendance((prev) => ({ ...prev, [phone]: newStatus }));

    try {
      const dateStr = selectedDate.toISOString().split("T")[0];
      await api.post("/attendance/mark", {
        studentPhone: phone,
        date: dateStr,
        status: newStatus,
      });
    } catch (err) {
      // Revert on error
      setAttendance((prev) => ({ ...prev, [phone]: previousStatus }));
      console.error("Failed to mark attendance:", err);
      toast(err.response?.data?.error || "Failed to mark attendance", "error");
    }
  };

  // Calculate summary counts
  const presentCount = Object.values(attendance).filter((s) => s === "present").length;
  const absentCount = Object.values(attendance).filter((s) => s === "absent").length;
  const unmarkedCount = students.length - presentCount - absentCount;

  if (loading) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box">
        <p>{error}</p>
        <button className="btn-primary" style={{ marginTop: "1rem" }} onClick={loadStudentsAndAttendance}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <DateNavigator date={selectedDate} onChange={setSelectedDate} />
      <AttendanceSummary present={presentCount} absent={absentCount} unmarked={unmarkedCount} />
      <StudentAttendanceList students={students} attendance={attendance} onToggle={toggleAttendance} />
    </div>
  );
}

// DateNavigator subcomponent
function DateNavigator({ date, onChange }) {
  const goToPrevDay = () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    onChange(prev);
  };

  const goToNextDay = () => {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    onChange(next);
  };

  const goToToday = () => {
    onChange(new Date());
  };

  const handleDateChange = (e) => {
    const newDate = new Date(e.target.value + "T00:00:00");
    if (!isNaN(newDate.getTime())) {
      onChange(newDate);
    }
  };

  const isToday = date.toDateString() === new Date().toDateString();
  const dateStr = date.toISOString().split("T")[0];
  const displayDate = date.toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={goToPrevDay} title="Previous day">
          ← Prev
        </button>
        
        <input
          type="date"
          className="form-input"
          style={{ width: "auto", flex: "1", minWidth: "150px" }}
          value={dateStr}
          onChange={handleDateChange}
        />
        
        <button className="btn-ghost" onClick={goToNextDay} title="Next day">
          Next →
        </button>
        
        {!isToday && (
          <button className="btn-primary" onClick={goToToday}>
            Today
          </button>
        )}
        
        <div style={{ marginLeft: "auto", fontSize: "0.875rem", color: "var(--text2)", fontWeight: 500 }}>
          {displayDate}
        </div>
      </div>
    </div>
  );
}

// AttendanceSummary subcomponent
function AttendanceSummary({ present, absent, unmarked }) {
  return (
    <div className="stat-grid" style={{ marginBottom: "1rem" }}>
      <div className="stat-card" style={{ "--stat-color": "var(--success)" }}>
        <div className="stat-icon">✅</div>
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">Present</div>
          <div className="stat-value">{present}</div>
        </div>
      </div>
      
      <div className="stat-card" style={{ "--stat-color": "var(--danger)" }}>
        <div className="stat-icon">❌</div>
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">Absent</div>
          <div className="stat-value">{absent}</div>
        </div>
      </div>
      
      <div className="stat-card" style={{ "--stat-color": "var(--muted)" }}>
        <div className="stat-icon">⏳</div>
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">Not Marked</div>
          <div className="stat-value">{unmarked}</div>
        </div>
      </div>
    </div>
  );
}

// StudentAttendanceList subcomponent
function StudentAttendanceList({ students, attendance, onToggle }) {
  if (students.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">👥</div>
        <p>No students found</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-title">Student Attendance</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {students.map((student) => {
          const status = attendance[student.phone];
          const isPresent = status === "present";
          const isAbsent = status === "absent";
          const isUnmarked = !status;

          return (
            <div
              key={student.phone || student.userId}
              className="streak-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
              }}
            >
              <div className="avatar" style={{ width: 36, height: 36, fontSize: "0.9rem" }}>
                {(student.registeredName || student.name || "?")[0].toUpperCase()}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="user-name" style={{ fontSize: "0.875rem" }}>
                  {student.registeredName || student.name || student.phone}
                </div>
                <div className="user-meta">{student.phone}</div>
              </div>
              
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className={`btn-ghost ${isPresent ? "active" : ""}`}
                  style={{
                    background: isPresent ? "var(--success)" : "transparent",
                    color: isPresent ? "#fff" : "var(--text2)",
                    borderColor: isPresent ? "var(--success)" : "var(--border)",
                    fontWeight: 600,
                  }}
                  onClick={() => onToggle(student.phone, "present")}
                >
                  ✓ Present
                </button>
                
                <button
                  className={`btn-ghost ${isAbsent ? "active" : ""}`}
                  style={{
                    background: isAbsent ? "var(--danger)" : "transparent",
                    color: isAbsent ? "#fff" : "var(--text2)",
                    borderColor: isAbsent ? "var(--danger)" : "var(--border)",
                    fontWeight: 600,
                  }}
                  onClick={() => onToggle(student.phone, "absent")}
                >
                  ✗ Absent
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
