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
      2. SHORT CODES ONLY: You MUST extract ONLY the short, abbreviated subject code (e.g., "DSA", "CG", "LDCO", "DSAL"). Completely IGNORE and REMOVE any long descriptive syllabus text, topics, or full names.
      3. RETAIN GROUP LETTERS: If a subject is meant for a specific practical batch/group, include the group letter in parentheses at the end of the short subject code (e.g., "DSAL (A)", "CGL (B)").
      4. REMOVE TEACHER INITIALS: Completely remove any teacher initials enclosed in parentheses.
      5. EXTRACT BOTH START & END TIMES (CRITICAL): Carefully look at the timetable grid or headers to find both the start time and the end time for every single lecture/lab slot.
      6. Standardize all times to a 12-hour AM/PM format (e.g., "08:45 AM", "11:00 AM", "01:45 PM").
      7. IGNORE BLANK CELLS: If a time slot or cell in the grid is physically empty/blank, DO NOT guess, DO NOT assume it is "LIB", and DO NOT add it. Simply skip that time slot entirely.
      8. STRICT ROW ALIGNMENT (CRITICAL): Read the grid strictly row by row, horizontally. Do NOT let subjects bleed from one day into another. Pay close attention to horizontal grid lines.
      9. HOLIDAYS: If a row explicitly says "HOLIDAY" (like Thursday), the array for that specific day MUST be completely empty. Do not accidentally pull classes from the day above or below it.
      
      Return ONLY a valid JSON object. Do not include markdown formatting or blocks like \`\`\`json.
      The structure MUST exactly match this format:
      {
        "Monday": [
          { "name": "DSA", "startTime": "08:45 AM", "endTime": "09:45 AM" },
          { "name": "Counseling", "startTime": "03:45 PM", "endTime": "04:45 PM" }
        ],
        "Thursday": []
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
    return Response.json({ error: "Failed to process the  image" }, { status: 500 });
  }
}