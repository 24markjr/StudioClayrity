import { customType, timestamp } from "drizzle-orm/pg-core";

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Postgres full-text search vector (populated by a generated column). */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
