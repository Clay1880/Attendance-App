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

   // Strict prompt enforcing filtering for Batch B and clean JSON output
    const prompt = `
      You are an expert scheduler. Extract the weekly timetable from this image.
      
      CRITICAL FILTERING RULES:
      1. The user is strictly in "Batch B".
      2. If a time slot has separate listings for different batches (e.g., "DTIL(A)" vs "BEE(B)" or "OOP(B)" vs "OOP(C)"), you MUST ONLY extract the subject corresponding to Batch B. Completely ignore subjects assigned explicitly to Batch A, Batch C, or other batches.
      3. If a subject is a general lecture meant for the whole class (no batch letter attached, like "OOP", "AS II", "BEE", or "ES & P"), extract it normally.
      4. Standardize the times to match standard formats like "08:45 AM", "11:00 AM", "01:45 PM", etc.
      
      Return ONLY a valid JSON object. Do not include markdown formatting or blocks like \`\`\`json.
      The structure MUST exactly match this format:
      {
        "Monday": [{ "name": "Subject Name", "time": "08:45 AM" }],
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