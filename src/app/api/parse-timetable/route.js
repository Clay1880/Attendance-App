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
    
    // NEW: Force strict JSON generation directly at the model level
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    // NEW: Upgraded bulletproof prompt
    const prompt = `
      You are an expert OCR and data extraction AI. Your task is to extract a master weekly college timetable from the provided image and convert it into a pristine JSON object.

      Timetables often contain merged cells, parallel batch practicals, and confusing formatting. Follow these CRITICAL PARSING RULES meticulously:

      1. GRID ORIENTATION & ALIGNMENT: Carefully identify the Days (Monday-Saturday) and the Time Slots. Ensure you do not mix up rows and columns. Read strictly row-by-row.
      2. PARALLEL CLASSES (CRITICAL): Engineering timetables often have multiple practical batches at the same time (e.g., Batch A in DSA Lab, Batch B in CG Lab). You MUST extract ALL of them. Create a separate JSON object for EACH batch running in that specific time slot.
      3. MERGED CELLS & DURATIONS: If a class (like a lab) spans multiple time blocks (e.g., a 2-hour lab spanning two columns), calculate the absolute start time and the absolute end time. Output ONE continuous block (e.g., 01:45 PM to 03:45 PM).
      4. CLEAN SHORT CODES ONLY: Extract ONLY the subject's abbreviated short code (e.g., "DSA", "CG", "LDCO", "DSAL"). 
      5. STRIP NOISE: Completely REMOVE teacher initials (e.g., "SKS", "(PR)"), room numbers (e.g., "Room 304", "Lab 1"), and syllabus topics.
      6. RETAIN BATCH/GROUP BRACKETS: If a subject is for a specific group, append it in parentheses (e.g., "DSAL (A)", "CGL (B1)").
      7. EXACT TIME FORMATTING: Standardize all times strictly to "hh:mm AM/PM" format (e.g., "08:45 AM", "12:00 PM", "01:45 PM").
      8. IGNORE NON-ACADEMIC SLOTS: Completely ignore cells labeled "LUNCH", "RECESS", "BREAK", "TEA", or blank cells. Do not include them in the JSON.
      9. HOLIDAYS/BLANK DAYS: If a row explicitly says "HOLIDAY" or is entirely empty, return an empty array for that day: []. Do not guess or pull from adjacent rows.

      OUTPUT FORMAT:
      Return strictly a valid JSON object. Do NOT include markdown formatting or blocks like \`\`\`json. The output must match this exact schema:
      {
        "Monday": [
          { "name": "DSA", "startTime": "08:45 AM", "endTime": "09:45 AM" },
          { "name": "DSAL (A)", "startTime": "09:45 AM", "endTime": "11:45 AM" },
          { "name": "CGL (B)", "startTime": "09:45 AM", "endTime": "11:45 AM" }
        ],
        "Tuesday": [],
        "Wednesday": []
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

    // The safety net `.replace` remains just in case, but `responseMimeType` 
    // ensures the responseText is native JSON.
    const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
    const jsonSchedule = JSON.parse(cleanedText);

    return Response.json(jsonSchedule);
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return Response.json({ error: "Failed to process image" }, { status: 500 });
  }
}