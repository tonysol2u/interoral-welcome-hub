require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const ratesRouter = require("./routes/rates");
const ledgerRouter = require("./routes/ledger");
const releaseRouter = require("./routes/release");
const ghlRouter = require("./routes/ghl");
const ingestRouter = require("./routes/ingest");
const webhooksRouter = require("./routes/webhooks");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || "").split(",") }));
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "interoral-welcome-hub", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/rates", ratesRouter);
app.use("/api/ledger", ledgerRouter);
app.use("/api/release", releaseRouter);
app.use("/api/ghl", ghlRouter);
app.use("/api/ingest", ingestRouter);
app.use("/api/webhooks", webhooksRouter);

app.listen(PORT, () => {
  console.log(`[InterOral Gateway] Running on port ${PORT}`);
});
