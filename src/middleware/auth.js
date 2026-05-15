/**
 * Auth middleware — validates JWT or API key.
 * Replace with your actual auth mechanism (Supabase JWT, custom, etc.)
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const token = authHeader.replace("Bearer ", "");

  // TODO: Validate JWT (Supabase JWT, custom JWT, or session token)
  // For now, decode and attach user_id
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    req.userId = payload.sub || payload.user_id;
    req.userEmail = payload.email;
    if (!req.userId) throw new Error("No user_id in token");
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { requireAuth };
