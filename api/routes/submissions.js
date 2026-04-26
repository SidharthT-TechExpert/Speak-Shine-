import express from "express";
import User from "../../models/userSchema.js";
import Auth from "../../models/authSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Find user by phone number (handles variations with/without country code).
 * Matches against User.phone field or User.userId regex.
 */
async function findUserByPhone(phone) {
  const stripped = phone.replace(/^91/, ""); // remove country code if present
  
  // Try phone field first (exact or without country code)
  let user = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (user) return user;
  
  // Fallback: userId contains the phone digits
  user = await User.findOne({ userId: { $regex: stripped } });
  return user || null;
}

// GET /api/submissions/:phone/weekly — get weekly submission count
router.get("/:phone/weekly", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Verify student exists
    const student = await findUserByPhone(phone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone 
      });
    }
    
    res.json({ 
      phone: student.phone,
      weeklySubmissions: student.weeklySubmissions || 0
    });
    
  } catch (err) {
    console.error("[Submissions] Get weekly error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/submissions/:phone/weekly — adjust weekly submission count
router.patch("/:phone/weekly", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    const { delta } = req.body;
    
    // Validate delta
    if (typeof delta !== "number") {
      return res.status(400).json({ 
        error: "Delta must be a number" 
      });
    }
    
    // Verify student exists
    const student = await findUserByPhone(phone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone 
      });
    }
    
    // Apply delta with floor at 0
    const currentValue = student.weeklySubmissions || 0;
    const newValue = Math.max(0, currentValue + delta);
    
    // Update the user record
    student.weeklySubmissions = newValue;
    await student.save();
    
    res.json({ 
      success: true,
      phone: student.phone,
      weeklySubmissions: newValue
    });
    
  } catch (err) {
    console.error("[Submissions] Patch weekly error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:phone/monthly — get monthly submission count
router.get("/:phone/monthly", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Verify student exists
    const student = await findUserByPhone(phone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone 
      });
    }
    
    res.json({ 
      phone: student.phone,
      monthlySubmissions: student.monthlySubmissions || 0
    });
    
  } catch (err) {
    console.error("[Submissions] Get monthly error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/submissions/:phone/monthly — adjust monthly submission count
router.patch("/:phone/monthly", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    const { delta } = req.body;
    
    // Validate delta
    if (typeof delta !== "number") {
      return res.status(400).json({ 
        error: "Delta must be a number" 
      });
    }
    
    // Verify student exists
    const student = await findUserByPhone(phone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone 
      });
    }
    
    // Apply delta with floor at 0
    const currentValue = student.monthlySubmissions || 0;
    const newValue = Math.max(0, currentValue + delta);
    
    // Update the user record
    student.monthlySubmissions = newValue;
    await student.save();
    
    res.json({ 
      success: true,
      phone: student.phone,
      monthlySubmissions: newValue
    });
    
  } catch (err) {
    console.error("[Submissions] Patch monthly error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/overview — get all students activity overview
router.get("/overview", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { search, sortBy, sortOrder } = req.query;
    
    // Get all users
    const users = await User.find().lean();
    
    // Get all auth records
    const auths = await Auth.find().lean();
    const authMap = {};
    auths.forEach(a => { authMap[a.phone] = a; });
    
    // Build result array
    let result = users.map(u => {
      const phone = u.phone || u.userId?.split("@")[0].split(":")[0];
      const auth = authMap[phone] || {};
      
      return {
        name: u.name || auth.name || "Unknown",
        phone: phone || "N/A",
        role: auth.role || "user",
        streak: u.streak || 0,
        weeklySubmissions: u.weeklySubmissions || 0,
        monthlySubmissions: u.monthlySubmissions || 0,
        fine: u.fine || 0,
        completed: u.completed || false,
        isActive: auth.isActive ?? true,
      };
    });
    
    // Apply search filter (name or phone substring)
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(student => 
        student.name.toLowerCase().includes(searchLower) ||
        student.phone.includes(search)
      );
    }
    
    // Apply sorting
    if (sortBy) {
      const order = sortOrder === "desc" ? -1 : 1;
      result.sort((a, b) => {
        const aVal = a[sortBy] ?? 0;
        const bVal = b[sortBy] ?? 0;
        
        if (typeof aVal === "string") {
          return order * aVal.localeCompare(bVal);
        }
        return order * (aVal - bVal);
      });
    }
    
    res.json(result);
    
  } catch (err) {
    console.error("[Submissions] Get overview error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
