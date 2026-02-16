# Code Style Guide

## Quick Reference

### File Placement

| Code Type | Location |
|-----------|----------|
| React component | `components/pages/`, `components/shared/`, or `components/ui/` |
| API logic | `services/{provider}/{service}/` |
| Reusable function | `utils/{utilName}/` |
| React hook | `hooks/use{HookName}/` |
| Third-party config | `libs/{libraryName}/` |

### File Extensions

| Extension | Purpose |
|-----------|---------|
| `.ts{x}` | Main code (use `.tsx` only when file contains JSX) |
| `.test.ts` | Tests |
| `.types.ts` | TypeScript types |
| `.utils.ts{x}` | Helper functions |
| `.utils.test.ts` | Tests for utility functions |
| `.schemas.ts` | Zod validation schemas |
| `.schemas.test.ts` | Tests for schemas |
| `.constants.ts{x}` | Static objects and constants |

### Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Component folders | camelCase | `userCard/` |
| Component files | PascalCase | `UserCard.tsx` |
| Everything else | camelCase | `httpClient.ts` |
| Variables/params | Descriptive (no single chars) | `event` not `e` |
| Constants | camelCase | `maxRetries` not `MAX_RETRIES` |

### Exports

All files use named exports:

```typescript
export function Component() {}
```

---

## Directory Structure

```text
src/
├── components/
│   ├── pages/                    # Page-level components
│   │   └── userProfilePage/
│   │       ├── UserProfilePage.tsx
│   │       └── profileView/
│   │           ├── ProfileView.tsx
│   │           └── avatarSection/
│   │               └── AvatarSection.tsx
│   ├── shared/                   # Reusable across pages
│   └── ui/                       # Pure presentation components
├── hooks/
│   └── useDebounce/
│       ├── useDebounce.ts
│       └── useDebounce.test.ts
├── libs/                         # Third-party wrappers
├── services/
│   └── hyperion/
│       └── users/
│           ├── users.ts
│           ├── users.schemas.ts
│           └── users.constants.ts
├── styles/
└── utils/
    └── date/
        ├── date.ts               # No .utils.ts extension in utils/
        └── date.test.ts
```

---

## Component Patterns

### File Organization

Components contain only JSX, Props type, and hooks. Extract everything else:

```text
userCard/
├── UserCard.tsx           # Component + Props type only
├── UserCard.types.ts      # All other types
├── UserCard.constants.ts  # All constants
└── UserCard.utils.ts      # All helper functions
```

### Component File

```typescript
// UserCard.tsx
import { formatUserName } from './UserCard.utils';
import type { User } from './UserCard.types';

type Props = {  // Never export Props
  user: User;
  onSelect: (id: string) => void;
};

export function UserCard({ user, onSelect }: Props) {
  return <div onClick={() => onSelect(user.id)}>{formatUserName(user.name)}</div>;
}
```

### Supporting Files

```typescript
// UserCard.types.ts
export type User = {
  id: string;
  name: string;
  status: 'active' | 'inactive';
};

// UserCard.constants.ts
export const maxNameLength = 30;

// UserCard.utils.ts
import { maxNameLength } from './UserCard.constants';

export function formatUserName(name: string): string {
  return name.length > maxNameLength ? `${name.slice(0, maxNameLength)}...` : name;
}
```

---

## Service Patterns

Services have three files: main functions, schemas, and constants.

### Main Service File

```typescript
// services/hyperion/users/users.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { http } from '@/utils/httpClient/httpClient';
import { api } from '@/utils/httpClient/httpClient.constants';
import { getUsersKey } from './users.constants';
import { GetUsersResponseSchema } from './users.schemas';

/* POST /api/v1/users */
export async function getUsers() {
  return http.get<GetUsersResponseSchema>(api.hyperion.users.v1.list, {
    responseSchema: GetUsersResponseSchema,
  });
}

export function useGetUsers() {
  return useQuery({
    queryKey: [getUsersKey],
    queryFn: getUsers,
  });
}
```

### Schema File

```typescript
// services/hyperion/users/users.schemas.ts
import { z } from 'zod';

export const GetUsersResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.uuid(),
      email: z.email(),
      name: z.string(),
    }),
  ),
});
export type GetUsersResponseSchema = z.infer<typeof GetUsersResponseSchema>;
```

### Constants File

```typescript
// services/hyperion/users/users.constants.ts
export const getUsersKey = 'getUsers';
```

---

## Testing Patterns

Use `test.each` with array of objects:

```typescript
import { describe, expect, test } from 'bun:test';
import { formatUserName } from './user';

describe('formatUserName', () => {
  test.each([
    {
      description: 'full name with all parts',
      input: 'Smith, John David',
      expected: { lastName: 'Smith', firstName: 'John', middleName: 'David' },
    },
    {
      description: 'name without middle',
      input: 'Smith, John',
      expected: { lastName: 'Smith', firstName: 'John', middleName: undefined },
    },
  ])('should handle $description', ({ input, expected }) => {
    expect(formatUserName(input)).toEqual(expected);
  });
});
```

---

## TypeScript Rules

- Use `type` for all type definitions (object shapes, unions, and advanced type operations)
- Schema types: `z.infer<typeof Schema>`
- **Schema names and type names should be the same**: In TypeScript, you can have a const and a type with the same name because they exist in different namespaces (value namespace vs type namespace). This keeps naming consistent and clear.

### Schema Pattern

```typescript
// Correct: Schema and type share the same name
export const UserInfoSchema = z.object({
  name: z.string().default(''),
  email: z.string().default(''),
});
export type UserInfoSchema = z.infer<typeof UserInfoSchema>;

// Usage - import the const, TypeScript automatically uses the type when needed:
import {UserInfoSchema} from './schemas';

// As a value (schema):
const result = UserInfoSchema.parse(data);
// As a type:
function getUser(): UserInfoSchema { ... }
```

```typescript
// Wrong: Different names for schema and type
export const UserInfoSchema = z.object({...});
export type UserInfo = z.infer<typeof UserInfoSchema>; // Don't rename
```

```typescript
// Wrong: Using type aliases when importing
import {UserInfoSchema} from './schemas';
import type {UserInfoSchema as UserInfoSchemaType} from './schemas'; // Don't alias
function getUser(): UserInfoSchemaType { ... } // Just use UserInfoSchema
```

---

## Barrel Files

**Do not use barrel files (`index.ts`/`index.js`) in application code.**

Barrel files are files that only re-export from other modules. They cause problems:

- **Circular imports**: Easy to accidentally create import cycles that crash bundlers
- **Slow development**: Loading a barrel loads all modules it exports, even if you only need one
- **Hard to optimize**: Bundlers struggle to tree-shake and optimize barrel imports

### Wrong

```typescript
// components/ui/index.ts
export { Button } from './button/Button';
export { Input } from './input/Input';
export { Card } from './card/Card';

// Usage creates circular import risk
import { Button } from '@/components/ui';
```

### Right

```typescript
// Import directly from the module
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
```

### Exception: NPM Libraries

Barrel files are **only** acceptable as the single entry point for npm packages:

```typescript
// packages/my-library/index.ts (package.json "main" field)
export { Button } from './components/Button';
export { useTheme } from './hooks/useTheme';
```

**Reference**: [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files#what-barrels-are-good-for)

---

## Component Hierarchy

Subcomponents belong to the component that imports them:

```text
announcementsPage/
├── AnnouncementsPage.tsx           # List page
└── announcementPage/               # Detail page (sibling)
    ├── AnnouncementPage.tsx
    └── announcementForm/           # Child of AnnouncementPage
        └── AnnouncementForm.tsx
```

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| `interface Props {...}` | `type Props = {...}` |
| `export type Props` | `type Props` (no export) |
| Types in component file | Move to `.types.ts` (except Props) |
| `utils/dateUtils/dateUtils.ts` | `utils/date/date.ts` |
| `const MAX_RETRIES = 3` | `const maxRetries = 3` |
| `(e) => handleClick(e)` | `(event) => handleClick(event)` |
| Constants in component | Extract to `.constants.ts` |
| Helpers in component | Extract to `.utils.ts` |
| Multiple components per file | One component per file |
| Barrel files (`index.ts`) | Direct imports from modules |
| Default exports | Named exports |
| Re-exporting types/values | Import directly from source file |
