import express, { Request, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const STRAPI_API_URL =
  process.env.STRAPI_API_URL || "http://localhost:1337/api/transactions";
const API_KEY = process.env.STRAPI_API_KEY || "your_api_key_here";

// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });

app.use(express.json());

interface Transaction {
  id: number;
  username: string;
  transactionId: number;
  transactionAmount: number;
  transactionType: string;
  isDirectDeposit?: boolean;
}

// Upload and process Excel file
app.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: "No file uploaded" });
        return;
      }

      // Read Excel file
      const filePath = path.resolve(req.file.path);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheetData: Transaction[] = xlsx.utils.sheet_to_json(
        workbook.Sheets[sheetName]
      );

      // Delete file after processing
      fs.unlinkSync(filePath);

      if (sheetData.length === 0) {
        res.status(400).json({ message: "Empty Excel file" });
        return;
      }

      // Send requests to Strapi in bulk
      const responses = await Promise.all(
        sheetData.map(async (data) => {
          try {
            const payload: Transaction = {
              id: data.id,
              username: data.username,
              transactionId: data.transactionId,
              transactionAmount: data.transactionAmount,
              transactionType: data.transactionType,
              isDirectDeposit: data.isDirectDeposit || false,
            };

            const response = await axios.post(
              "http://localhost:1337/api/compute-commissions",
              payload,
              {
                headers: {
                  "Content-Type": "application/json",
                },
              }
            );

            return { data: response.data, username: payload?.username };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        })
      );

      res.status(200).json(
        responses?.map((item, index) => {
          const rewardUsers = item?.data?.message;
          const username = item?.username;

          return {
            no: index + 1,
            username,
            rewardUsers,
          };
        })
      );
    } catch (error) {
      res.status(500).json({
        message: "Error processing file",
        error: (error as Error).message,
      });
    }
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
