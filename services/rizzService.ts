import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse, RizzOrBioResponse } from "../types";

// --- CLIENT INITIALIZATION ---
// Using Google GenAI as per guidelines
// The API key must be obtained exclusively from process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- LOCAL PRE-FILTERS ---

// 1. HARD SAFETY BLOCK (Illegal, Hate Speech, Extreme Violence, Self-Harm)
// Includes racial/ethnic slurs, severe violence, self-harm, and illegal acts.
const HARD_BLOCK_REGEX = /\b(nigger|nigga|negro|coon|faggot|fag|dyke|kike|chink|spic|gook|raghead|towelhead|retard|retarded|mongoloid|tranny|shemale|hermaphrodite|rape|rapist|molest|molester|pedophile|pedo|hebephile|ephebophile|cp|child porn|bestiality|zoophilia|necrophilia|incest|kill yourself|kys|suicide|self-harm|unalive|terrorist|jihad|isis|taliban|nazi|hitler|holocaust|white power|white supremacy|kkk|school shooter|mass shooting|bomb|behead|decapitate|mutilate|genocide|ethnic cleansing|slave|slavery|lynch|lynching|beaner|wetback|paki|sand nigger|timber nigger|prairie nigger|honky|cracker|gassed|groomer|seppuku|snuff|gore)\b/i;

// 2. NSFW CONTEXT (FOR ROASTING)
// Includes anatomical terms, sexual acts, fetishes, internet slang, and pornographic categories.
const NSFW_TERMS_REGEX = /\b(sex|nudes|naked|nude|horny|aroused|boner|erection|erect|hard-on|dick|cock|pussy|vagina|penis|boobs|tits|titties|nipples|areola|orgasm|climax|shag|fuck|fucking|fucked|fucker|motherfucker|gangbang|bukkake|creampie|anal|oral|cum|jizz|semen|sperm|load|milf|dilf|gilf|thicc|gyatt|bussy|breeding|breed|nut|suck|lick|eating out|69|doggystyle|missionary|cowgirl|reverse cowgirl|bdsm|bondage|dom|sub|dominatrix|feet|toes|fetish|kink|squirt|gushing|deepthroat|blowjob|handjob|rimjob|fingering|fisting|pegging|scissoring|tribadism|watersports|scat|golden shower|hentai|porn|pornography|xxx|adult movie|onlyfans|fansly|send nudes|clit|clitoris|vulva|labia|asshole|butthole|anus|rectum|booty|butt|ass|twerk|strip|stripper|hooker|prostitute|escort|slut|whore|skank|hoe|bitch|cunt|twat|wank|jerking off|jacking off|masturbate|masturbation|dildo|vibrator|sex toy|fleshlight|strap-on|camgirl|sugardaddy|sugarbaby|sugar daddy|sugar baby|simp|incel|virgin|cuck|cuckold|schlong|dong|knob|bellend|prick|chode|taint|gooch|perineum|ballbag|scrotum|nutsack|gonads|foreskin|smegma|felching|docking|sounding|snowballing|tea bag|motorboat|queef|rusty trombone|dirty sanchez|alabama hot pocket|cleveland steamer|wanker|tosser|bugger|sod|slag|tart|strumpet|harlot|bimbo|himbo|yiff|furry|futa|futanari|yaoi|yuri|ecchi|bara|erotic|erotica|sensual|genitalia|groin|crotch|loins|pubes|pubic|phallic|yoni|lingam|coitus|copulate|copulation|fornicate|fornication|sodomy|buggery|pederasty|onanism|autoerotic|frottage|voyeur|exhibitionist|nympho|nymphomaniac|satyr|glory hole|gloryhole|blue waffle|lemon party|tubgirl|goatse|meatspin|2 girls 1 cup|rule 34|r34|paizuri|ahegao|netorare|ntr|goon|gooning|edging|coomer|fap|fapping|schlick|bean flicking|clam|beaver|muff|camel toe|moose knuckle|bulge|packing|hung|girth|balls|nads|mangina|she-cock|ladyboy|femboy|sissy|trap|peen|wiener|ding dong|wang|member|shaft|glans|urethra|cervix|ovaries|womb|uterus|fallopian|hymen|cherry|deflower|pop the cherry|creampied|impregnate|knock up|knocked up|cumshot|money shot|facial|pearl necklace|gokkun|snowball|blowie|bj|hj|zj|blumpkin|upper decker|donkey punch|houdini|eiffel tower|spit roast|dp|double penetration|dvda|atm|ass to mouth|a2m|tribbing|frotting|figging|rosebud|prolapse|pink sock|waffle|jar|coconut|shoebox|jolly rancher|doritos|colby|broken arms|stepmom|stepdad|stepbro|stepsis|folgers|family strokes|sweet home alabama|roll tide|daddy|mommy|kitten|discord kitten|puppy|master|mistress|brat|tamer|handler|switch|top|bottom|vers|side|pillow princess|starfish|vanilla|discipline|sadism|masochism|sado|maso|sm|ds|ddlg|abdl|ageplay|petplay|murr|fursuit|knot|knotting|heat|rut|omegaverse|alpha|beta|omega|slick|tramp|floozy|trollop|minx|vixen|thot|instahoe|e-girl|e-boy|patreon|sex worker|streetwalker|lot lizard|lady of the night|rentboy|gigolo|sugar momma|paypig|findom|soles|arches|pedicure|footjob|armpits|pits|musk|sweat|pheromone|scent|sniff|sniffling|underwear|panties|bra|lingerie|stockings|thigh highs|garters|suspenders|corset|bustier|teddies|babydoll|chemise|negligee|robe|kimono|yukata|bikini|swimsuit|maillot|tankini|monokini|thong|g-string|c-string|commando|freeballing|upskirt|downblouse|nipslip|wardrobe malfunction|cameltoe|mooseknuckle|vpl|print|outline|x-ray|see-through|sheer|transparent|translucent|wet t-shirt|wet look|oil|lube|lubricant|lotion|vaseline|ky|astroglide|spit|saliva|drool|slobber|gag|choke|breathplay|asphyxiation|strangle|suffocate|smother|facesit|queening|kinging|trampling|crush|giantess|macro|micro|vore|unbirth|inflation|expansion|transformation|tf|tg|gender bender|sissy hypno|hypno|mind control|mc|brainwash|bimboification)\b/i;

export async function generateRizz(
  inputText: string, 
  image?: string | null, 
  vibe?: string
): Promise<RizzOrBioResponse> {
    // 1. Safety Filter
    if (HARD_BLOCK_REGEX.test(inputText)) {
        return {
            potentialStatus: 'Blocked',
            analysis: 'Safety Policy Violation: Input contains prohibited content.',
            loveScore: 0,
            tease: 'N/A',
            smooth: 'N/A',
            chaotic: 'N/A'
        } as RizzResponse;
    }

    const parts: any[] = [];
    
    // 2. Handle Image
    if (image) {
        // Extract base64
        // Format: "data:image/png;base64,..."
        try {
            const split = image.split(',');
            if (split.length > 1) {
                const base64Data = split[1];
                const mimeMatch = image.match(/:(.*?);/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }
        } catch (e) {
            console.error("Error parsing image", e);
        }
    }

    // 3. Construct Prompt
    const promptText = `
    You are a dating assistant (Rizz Master). Your goal is to generate witty, charming, and effective replies.
    
    Context provided by user: "${inputText}"
    ${vibe ? `Desired Vibe: ${vibe}` : ''}
    
    Please provide:
    1. 'tease': A playful, slightly roasting but flirty reply.
    2. 'smooth': A charming, direct, and romantic reply.
    3. 'chaotic': An unpredictable, funny, or unhinged reply.
    4. 'loveScore': An integer 0-100 indicating the success potential.
    5. 'potentialStatus': A short status like 'Friendzone', 'Soulmate', 'It's Complicated'.
    6. 'analysis': A brief analysis of the context and why these lines work.

    IMPORTANT: Return ONLY JSON matching the schema.
    `;
    
    parts.push({ text: promptText });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        tease: { type: Type.STRING },
                        smooth: { type: Type.STRING },
                        chaotic: { type: Type.STRING },
                        loveScore: { type: Type.INTEGER },
                        potentialStatus: { type: Type.STRING },
                        analysis: { type: Type.STRING },
                    },
                    required: ["tease", "smooth", "chaotic", "loveScore", "potentialStatus", "analysis"]
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("Empty response from AI");
        
        return JSON.parse(text) as RizzResponse;

    } catch (e) {
        console.error("AI Generation Error:", e);
        return {
            potentialStatus: 'Error',
            analysis: 'The Rizz Master is taking a nap. (System Error)',
            loveScore: 0,
            tease: '',
            smooth: '',
            chaotic: ''
        } as RizzResponse;
    }
}

export async function generateBio(inputText: string, vibe?: string): Promise<RizzOrBioResponse> {
    if (HARD_BLOCK_REGEX.test(inputText)) {
        return {
            bio: '',
            analysis: 'Safety Policy Violation: Input contains prohibited content.'
        } as BioResponse;
    }

    const prompt = `
    Generate a dating profile bio based on this info: "${inputText}". 
    ${vibe ? `Vibe: ${vibe}` : ''}
    
    Requirements:
    - Keep it engaging and under 200 characters.
    - Provide a short 'analysis' of why this bio works.
    
    Return ONLY JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        bio: { type: Type.STRING },
                        analysis: { type: Type.STRING },
                    },
                    required: ["bio", "analysis"]
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("Empty response from AI");

        return JSON.parse(text) as BioResponse;

    } catch (e) {
        console.error("AI Generation Error:", e);
        return {
            bio: '',
            analysis: 'System Error: Could not generate bio.'
        } as BioResponse;
    }
}
