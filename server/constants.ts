// Constants
import OpenAI from 'openai';
import fs from 'fs'

export const client = new OpenAI({
    baseURL: "http://localhost:4444/v1/",
    apiKey: process.env.TARGON_API_KEY
});

export const ASSISTANT = "<｜Assistant｜>";
export const USER = "<｜User｜>";
export const SYSTEM = "<｜System｜>";
export const START_HEADER_ID = "<｜start_header_id｜>";
export const END_HEADER_ID = "<｜end_header_id｜>";
export const SEED = parseInt(process.argv[2]) || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
export const SAA_SETTINGS = { model: "mistralai/mistral-tiny", provider: null }

// Load the VI prompt from file
let vi_prompt = '';
try {
    if (!fs.existsSync('./.prompts/VI_BASE.txt')) {
        throw new Error("VI_BASE.txt not found");
    }
    vi_prompt = fs.readFileSync('./.prompts/VI_BASE.txt', 'utf8');
    if (!fs.existsSync('./.prompts/VI_CONTINUED.txt')) {
        fs.writeFileSync('./.prompts/VI_CONTINUED.txt', '');
    }
    vi_prompt += fs.readFileSync('./.prompts/VI_CONTINUED.txt', 'utf8');
} catch (err) {
    console.error("Error loading prompts:", err);
}

export { vi_prompt };

// Default name for testing
export const name = 'Alex';