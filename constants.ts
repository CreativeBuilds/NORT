// Constants
import OpenAI from 'openai';
import fs from 'fs'
export const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY
});

export const ASSISTANT = "<｜Assistant｜>";
export const USER = "";
export const SYSTEM = "<｜System｜>";
export const START_HEADER_ID = "<｜start_header_id｜>";
export const END_HEADER_ID = "<｜end_header_id｜>";
export const SEED = parseInt(process.argv[2]) || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
export const SAA_SETTINGS = { model: "mistralai/mistral-tiny", provider: null }
export let name = 'Alex'
export let vi_prompt = '';

try {
    if (!fs.existsSync('./.prompts/VI_BASE.txt')) {
        throw new Error("VI_BASE.txt not found")
    }
    vi_prompt = fs.readFileSync('./.prompts/VI_BASE.txt', 'utf8');
    if (!fs.existsSync('./.prompts/VI_CONTINUED.txt')) {
        fs.writeFileSync('./.prompts/VI_CONTINUED.txt', '');
    }
    vi_prompt += fs.readFileSync('./.prompts/VI_CONTINUED.txt', 'utf8');
} catch (err) {
    console.error('Error loading prompts:', err);
    process.exit(1);
}