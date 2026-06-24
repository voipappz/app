/**
 * Self-contained Hebrew mock conversations.
 *
 * Drop this file into your React app (e.g. src/mocks/conversation-mocks.ts)
 * and import the factories or the ready-made array:
 *
 *   import {
 *     hebrewMockConversations,
 *     createHebrewBillingConversation,
 *     createHebrewInternetConversation,
 *   } from './mocks/conversation-mocks';
 *
 * No external dependencies — pure data + types.
 */

export type Speaker = 'agent' | 'caller' | 'system';
export type CallDirection = 'incoming' | 'outgoing' | 'missed';
export type ConversationStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'unavailable';

export interface ConversationMessage {
    uuid: string;
    speaker: Speaker;
    text: string;
    /** Seconds from call start */
    timestamp: number;
    /** Speech-to-text confidence (0–1) */
    confidence?: number;
    speakerName?: string;
}

export interface ConversationMetadata {
    contactName: string;
    contactNumber: string;
    direction: CallDirection;
    callDate: Date;
    /** Total call duration in seconds */
    duration: number;
    agentName?: string;
}

export interface Conversation {
    callUuid: string;
    messages: ConversationMessage[];
    metadata: ConversationMetadata;
    status: ConversationStatus;
    error?: string;
}

/**
 * Hebrew customer-service conversation: billing inquiry (Partner cellular).
 * Pass a real callUuid to bind it to a specific call record.
 */
export function createHebrewBillingConversation(
    callUuid: string = 'mock-call-hebrew-billing'
): Conversation {
    return {
        callUuid,
        status: 'completed',
        metadata: {
            contactName: 'יעל כהן',
            contactNumber: '050-123-4567',
            direction: 'outgoing',
            callDate: new Date(),
            duration: 198,
            agentName: 'נציגת שירות - פרטנר',
        },
        messages: [
            { uuid: '1', speaker: 'system', text: 'השיחה התחילה', timestamp: 0 },
            {
                uuid: '2',
                speaker: 'agent',
                text: 'שלום, הגעת למוקד שירות הלקוחות של פרטנר, שמי נועה. במה אוכל לעזור?',
                timestamp: 4,
                speakerName: 'נועה',
                confidence: 0.96,
            },
            {
                uuid: '3',
                speaker: 'caller',
                text: 'שלום נועה, קיבלתי את החשבונית של החודש והיא הרבה יותר גבוהה מהרגיל. רציתי להבין למה.',
                timestamp: 11,
                speakerName: 'יעל כהן',
                confidence: 0.92,
            },
            {
                uuid: '4',
                speaker: 'agent',
                text: 'אין בעיה, אשמח לעזור. אפשר בבקשה את מספר הטלפון שמופיע על החשבונית ואת תעודת הזהות לזיהוי?',
                timestamp: 19,
                speakerName: 'נועה',
                confidence: 0.97,
            },
            {
                uuid: '5',
                speaker: 'caller',
                text: 'בטח, המספר הוא 050-123-4567 ותעודת הזהות 034567891.',
                timestamp: 28,
                speakerName: 'יעל כהן',
                confidence: 0.9,
            },
            {
                uuid: '6',
                speaker: 'agent',
                text: 'תודה רבה, רגע אחד אני בודקת... כן, אני רואה את החשבונית. החודש החיוב הוא 287 שקלים במקום 159 שקלים בממוצע.',
                timestamp: 38,
                speakerName: 'נועה',
                confidence: 0.95,
            },
            {
                uuid: '7',
                speaker: 'caller',
                text: 'בדיוק, מה גרם להפרש?',
                timestamp: 51,
                speakerName: 'יעל כהן',
                confidence: 0.94,
            },
            {
                uuid: '8',
                speaker: 'agent',
                text: 'אני רואה כאן שביצעת שיחות לחו"ל, בסך הכל 58 דקות לארצות הברית. אין לך כרגע חבילה בינלאומית פעילה.',
                timestamp: 56,
                speakerName: 'נועה',
                confidence: 0.93,
            },
            {
                uuid: '9',
                speaker: 'caller',
                text: 'אה, נכון, נסעתי לבן משפחה שגר שם. שכחתי לגמרי שאין לי חבילה.',
                timestamp: 69,
                speakerName: 'יעל כהן',
                confidence: 0.91,
            },
            {
                uuid: '10',
                speaker: 'agent',
                text: 'הבנתי. יש לנו חבילה בינלאומית ב-29 שקלים לחודש שכוללת 200 דקות לכל העולם. רוצה שאוסיף לך אותה?',
                timestamp: 78,
                speakerName: 'נועה',
                confidence: 0.96,
            },
            {
                uuid: '11',
                speaker: 'caller',
                text: 'כן, נשמע משתלם. בבקשה תוסיפי.',
                timestamp: 91,
                speakerName: 'יעל כהן',
                confidence: 0.93,
            },
            {
                uuid: '12',
                speaker: 'agent',
                text: 'מעולה, החבילה נוספה לחשבונך והיא בתוקף מהיום. ולגבי החיוב הנוכחי - אני מאשרת לך זיכוי חד-פעמי של 50 שקלים כמחווה.',
                timestamp: 98,
                speakerName: 'נועה',
                confidence: 0.95,
            },
            {
                uuid: '13',
                speaker: 'caller',
                text: 'וואו, תודה רבה! זה ממש נחמד מצידכם.',
                timestamp: 114,
                speakerName: 'יעל כהן',
                confidence: 0.94,
            },
            {
                uuid: '14',
                speaker: 'agent',
                text: 'בשמחה. הזיכוי יופיע בחשבונית הבאה. עוד משהו שאוכל לעזור בו?',
                timestamp: 121,
                speakerName: 'נועה',
                confidence: 0.97,
            },
            {
                uuid: '15',
                speaker: 'caller',
                text: 'לא, זה הכל. תודה רבה נועה.',
                timestamp: 131,
                speakerName: 'יעל כהן',
                confidence: 0.95,
            },
            {
                uuid: '16',
                speaker: 'agent',
                text: 'תודה שפנית אלינו, יום נעים!',
                timestamp: 137,
                speakerName: 'נועה',
                confidence: 0.98,
            },
            { uuid: '17', speaker: 'system', text: 'השיחה הסתיימה', timestamp: 142 },
        ],
    };
}

/**
 * Hebrew customer-service conversation: slow internet troubleshooting (Bezeq).
 * Pass a real callUuid to bind it to a specific call record.
 */
export function createHebrewInternetConversation(
    callUuid: string = 'mock-call-hebrew-internet'
): Conversation {
    return {
        callUuid,
        status: 'completed',
        metadata: {
            contactName: 'רותם שפירא',
            contactNumber: '054-444-5555',
            direction: 'outgoing',
            callDate: new Date(),
            duration: 525,
            agentName: 'תמיכה טכנית - בזק',
        },
        messages: [
            { uuid: '1', speaker: 'system', text: 'השיחה התחילה', timestamp: 0 },
            {
                uuid: '2',
                speaker: 'agent',
                text: 'שלום, הגעת לתמיכה הטכנית של בזק, שמי דנה. איך אפשר לעזור?',
                timestamp: 3,
                speakerName: 'דנה',
                confidence: 0.97,
            },
            {
                uuid: '3',
                speaker: 'caller',
                text: 'שלום דנה, יש לי בעיה עם האינטרנט בבית. כבר כמה ימים שהוא ממש איטי, בעיקר בערב.',
                timestamp: 10,
                speakerName: 'רותם',
                confidence: 0.93,
            },
            {
                uuid: '4',
                speaker: 'agent',
                text: 'אני מצטערת לשמוע. בואי נבדוק את זה יחד. אפשר את מספר הלקוח או את מספר הטלפון של הבית?',
                timestamp: 20,
                speakerName: 'דנה',
                confidence: 0.95,
            },
            {
                uuid: '5',
                speaker: 'caller',
                text: 'מספר הלקוח הוא 04578923.',
                timestamp: 30,
                speakerName: 'רותם',
                confidence: 0.91,
            },
            {
                uuid: '6',
                speaker: 'agent',
                text: 'תודה. אני רואה את הקו שלך. מתי בערך התחילה הבעיה?',
                timestamp: 38,
                speakerName: 'דנה',
                confidence: 0.96,
            },
            {
                uuid: '7',
                speaker: 'caller',
                text: 'לפני בערך שלושה ימים. בבוקר זה בסדר, אבל מהשעה שבע בערב זה נהיה כמעט בלתי שמיש.',
                timestamp: 45,
                speakerName: 'רותם',
                confidence: 0.92,
            },
            {
                uuid: '8',
                speaker: 'agent',
                text: 'מבינה. אני מבצעת עכשיו בדיקה מרחוק על הקו ועל הראוטר שלך, רגע אחד בבקשה.',
                timestamp: 57,
                speakerName: 'דנה',
                confidence: 0.94,
            },
            {
                uuid: '9',
                speaker: 'caller',
                text: 'בסדר גמור, אני ממתינה.',
                timestamp: 67,
                speakerName: 'רותם',
                confidence: 0.93,
            },
            {
                uuid: '10',
                speaker: 'agent',
                text: 'אוקיי, מצאתי שני דברים. ראשית, יש עומס משמעותי בקו בשעות הערב באזור שלך, ושנית, הראוטר שלך מדגם ישן יחסית ולא תומך במהירות שאת משלמת עליה.',
                timestamp: 95,
                speakerName: 'דנה',
                confidence: 0.95,
            },
            {
                uuid: '11',
                speaker: 'caller',
                text: 'אז מה אפשר לעשות?',
                timestamp: 112,
                speakerName: 'רותם',
                confidence: 0.94,
            },
            {
                uuid: '12',
                speaker: 'agent',
                text: 'אני יכולה לשלוח אלייך טכנאי שיחליף את הראוטר לדגם חדש, ללא עלות. בנוסף אני פותחת קריאה לטיפול בעומס בקו.',
                timestamp: 119,
                speakerName: 'דנה',
                confidence: 0.96,
            },
            {
                uuid: '13',
                speaker: 'caller',
                text: 'נהדר. מתי טכנאי יוכל להגיע?',
                timestamp: 134,
                speakerName: 'רותם',
                confidence: 0.93,
            },
            {
                uuid: '14',
                speaker: 'agent',
                text: 'יש לי תור פנוי מחר בין ארבע לשש אחר הצהריים, או ביום חמישי בבוקר בין שמונה לעשר. מה מתאים יותר?',
                timestamp: 142,
                speakerName: 'דנה',
                confidence: 0.95,
            },
            {
                uuid: '15',
                speaker: 'caller',
                text: 'מחר אחר הצהריים מצוין, אני בבית.',
                timestamp: 158,
                speakerName: 'רותם',
                confidence: 0.94,
            },
            {
                uuid: '16',
                speaker: 'agent',
                text: 'מעולה. שריינתי לך תור למחר בין ארבע לשש. תקבלי SMS עם פרטי הטכנאי כשעה לפני ההגעה.',
                timestamp: 165,
                speakerName: 'דנה',
                confidence: 0.97,
            },
            {
                uuid: '17',
                speaker: 'caller',
                text: 'תודה רבה דנה, באמת עזרת לי הרבה.',
                timestamp: 180,
                speakerName: 'רותם',
                confidence: 0.95,
            },
            {
                uuid: '18',
                speaker: 'agent',
                text: 'בשמחה. בינתיים, את יכולה לנסות לכבות את הראוטר לחמש דקות ולהדליק שוב, זה לפעמים עוזר זמנית. עוד משהו?',
                timestamp: 188,
                speakerName: 'דנה',
                confidence: 0.96,
            },
            {
                uuid: '19',
                speaker: 'caller',
                text: 'לא, זה הכל. תודה רבה ויום טוב.',
                timestamp: 202,
                speakerName: 'רותם',
                confidence: 0.94,
            },
            {
                uuid: '20',
                speaker: 'agent',
                text: 'גם לך, יום נעים ושיהיה בהצלחה!',
                timestamp: 209,
                speakerName: 'דנה',
                confidence: 0.98,
            },
            { uuid: '21', speaker: 'system', text: 'השיחה הסתיימה', timestamp: 215 },
        ],
    };
}

/**
 * Ready-made array of the two Hebrew mock conversations.
 * Position 0 = billing (Partner), position 1 = internet (Bezeq).
 */
export const hebrewMockConversations: Conversation[] = [
    createHebrewBillingConversation(),
    createHebrewInternetConversation(),
];

// --- UI adapters -----------------------------------------------------------
// Bridge the rich Conversation shape above to the transcript shape the Calls
// drawer renders (CallTranscript.jsx): { status, language, confidence,
// segments[] } where each segment is { speaker, start, text }.

/** One transcript segment as consumed by CallTranscript.jsx. */
export interface TranscriptSegment {
    speaker: Exclude<Speaker, 'system'>;
    /** Seconds from call start (CallTranscript renders this as a timecode). */
    start: number;
    text: string;
}

/** Transcript shape CallTranscript.jsx expects. */
export interface Transcript {
    status: ConversationStatus;
    language: string;
    confidence: number;
    segments: TranscriptSegment[];
}

/**
 * Map a Conversation to the transcript shape the Calls drawer renders.
 * Drops 'system' turns (no bubble style) and folds message confidences into a
 * single top-level confidence.
 */
export function conversationToTranscript(c: Conversation): Transcript {
    const turns = c.messages.filter((m) => m.speaker !== 'system');
    const scored = turns.filter((m) => typeof m.confidence === 'number');
    const confidence = scored.length
        ? scored.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / scored.length
        : 0.95;
    return {
        status: c.status,
        language: 'he',
        confidence,
        segments: turns.map((m) => ({
            speaker: m.speaker as Exclude<Speaker, 'system'>,
            start: m.timestamp,
            text: m.text,
        })),
    };
}

/**
 * Pick a mocked transcript for a real call by its direction, bound to the
 * call's own id. Inbound → billing (Partner); everything else → internet (Bezeq).
 */
export function mockTranscriptForCall(call: { id: string; direction?: string }): Transcript {
    const conversation = call.direction === 'inbound'
        ? createHebrewBillingConversation(call.id)
        : createHebrewInternetConversation(call.id);
    return conversationToTranscript(conversation);
}

// --- Persistence -----------------------------------------------------------
// Remembers which calls have already been "transcribed" in the demo so the
// conversation reappears instantly on reopen (the real server has no transcript
// for them). localStorage-backed, so it survives a page reload too.

const STORE_KEY = 'demo:mockTranscripts';

function readStore(): Record<string, Transcript> {
    try {
        return JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '{}') as Record<string, Transcript>;
    } catch {
        return {};
    }
}

/** The mocked transcript previously generated for this call, or null. */
export function getStoredMockTranscript(callId: string): Transcript | null {
    return readStore()[callId] ?? null;
}

/** Persist a generated mock transcript so reopening the call shows it at once. */
export function storeMockTranscript(callId: string, transcript: Transcript): void {
    try {
        const all = readStore();
        all[callId] = transcript;
        globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
        /* localStorage unavailable (SSR/private mode) — fall back to no persistence */
    }
}
