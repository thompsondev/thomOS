import type { Repository } from 'typeorm';
import type { User } from '../../database/entities';
import type Anthropic from '@anthropic-ai/sdk';

export type DbToolOptions = {
  getCurrentUserId?: () => Promise<string | null>;
};

const RETRIEVAL_INTENTS = ['account_created_at', 'account_email'] as const;
type RetrievalIntent = (typeof RETRIEVAL_INTENTS)[number];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

async function handleAccountCreatedAt(
  users: Repository<User>,
  userId: string | null,
): Promise<string> {
  try {
    if (!userId) {
      return "I can't look up your account date without knowing who you are. If you're logged in, try asking again from the app.";
    }
    const user = await users.findOne({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user?.createdAt) {
      return "I couldn't find an account creation date for you.";
    }
    return `You created your account on ${formatDate(user.createdAt.toISOString())}.`;
  } catch {
    return "I don't have access to that information right now.";
  }
}

async function handleAccountEmail(
  users: Repository<User>,
  userId: string | null,
): Promise<string> {
  try {
    if (!userId) {
      return "I can't look up your email without knowing who you are. If you're logged in, try asking again from the app.";
    }
    const user = await users.findOne({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email == null || user.email === '') {
      return "I couldn't find an email on file for your account.";
    }
    return `The email on your account is ${user.email}.`;
  } catch {
    return "I don't have access to that information right now.";
  }
}

export function getDatabaseToolDefinition(): Anthropic.Tool {
  return {
    name: 'database',
    description:
      "Use this only to answer factual questions about the user's own account data (account creation date or email on file). Do not list tables or expose schema.",
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: [...RETRIEVAL_INTENTS],
          description:
            'account_created_at: when the user created their account. account_email: email on the user account.',
        },
      },
      required: ['intent'],
    },
  };
}

export async function executeDatabaseTool(
  users: Repository<User>,
  input: { intent?: string },
  options: DbToolOptions = {},
): Promise<{ answer: string }> {
  const intent = input.intent as RetrievalIntent | undefined;
  const userId = options.getCurrentUserId
    ? await options.getCurrentUserId()
    : null;

  switch (intent) {
    case 'account_created_at':
      return { answer: await handleAccountCreatedAt(users, userId) };
    case 'account_email':
      return { answer: await handleAccountEmail(users, userId) };
    default:
      return { answer: "I don't have a way to look up that information." };
  }
}
