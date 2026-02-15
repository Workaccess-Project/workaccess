// backend/routes/documents.js
import express from "express";
import multer from "multer";

import { requireWrite } from "../auth.js";
import {
  deleteDocumentService,
  downloadDocumentService,
  listDocumentsService,
  uploadDocumentService,
} from "../services/documents.service.js";

const router = express.Router();

// memory storage = simple & stable for v1
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
  },
});

/**
 * GET /api/documents
 * READ pro všechny role
 */
router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const items = await listDocumentsService({ companyId });
  res.json(items);
});

/**
 * POST /api/documents
 * multipart/form-data: file
 * WRITE: hr/manager
 */
router.post("/", requireWrite, upload.single("file"), async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const created = await uploadDocumentService({
      companyId,
      actorRole: req.role,
      file: req.file,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/documents/:id/download
 * READ pro všechny role
 */
router.get("/:id/download", async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const { doc, fullPath } = await downloadDocumentService({
      companyId,
      actorRole: req.role,
      id,
    });

    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.originalName}"`
    );

    // send file
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/documents/:id
 * WRITE: hr/manager
 */
router.delete("/:id", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const result = await deleteDocumentService({
      companyId,
      actorRole: req.role,
      id,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
