import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert the uploaded file to a base64 string
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an expert scheduler. Extract the entire master weekly timetable from this image.
      
      CRITICAL PARSING RULES:
      1. DO NOT filter for any specific batch or group. Extract ALL subjects for ALL groups (A, B, C, etc.) from the image.
      2. RETAIN GROUP LETTERS: If a subject is meant for a specific practical batch/group, you MUST include the group letter in parentheses at the end of the subject name (e.g., "DTIL Lab (A)", "BEE Lab (B)", "ES & P Tut (C)").
      3. REMOVE TEACHER INITIALS: Completely remove any teacher initials enclosed in parentheses. For example, change "OOP (MB)" to just "OOP", and change "AS II (ST)" to just "AS II". ONLY use parentheses for student group letters.
      4. COMMON LECTURES: If a subject is a general lecture meant for the whole class with no specific group mentioned, extract it normally without any parentheses (e.g., "OOP", "BEE", "AS II").
      5. CONCURRENT CLASSES: If multiple labs happen at the exact same time for different groups, extract EACH one as a separate object in that day's array, sharing the exact same time string.
      6. Standardize the times to match 12-hour formats like "08:45 AM", "11:00 AM", "01:45 PM", etc.
      
      Return ONLY a valid JSON object. Do not include markdown formatting or blocks like \`\`\`json.
      The structure MUST exactly match this format:
      {
        "Monday": [
          { "name": "OOP", "time": "08:45 AM" },
          { "name": "DTIL Lab (A)", "time": "11:00 AM" },
          { "name": "BEE Lab (B)", "time": "11:00 AM" },
          { "name": "ES & P Tut (C)", "time": "11:00 AM" }
        ],
        "Tuesday": [{ "name": "Subject Name", "time": "11:30 AM" }]
      }
      Only include standard weekdays (Monday to Saturday). Ignore Sunday.
`;

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: file.type,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();

    // Clean up response in case Gemini includes code blocks
    const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
    const jsonSchedule = JSON.parse(cleanedText);

    return Response.json(jsonSchedule);
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return Response.json({ error: "Failed to process image" }, { status: 500 });
  }
}