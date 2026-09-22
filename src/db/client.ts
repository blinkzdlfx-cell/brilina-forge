import { neon } from "@neondatabase/serverless";
import { config } from "../config.js";

type Sql = ReturnType<typeof neon>;

let sql: Sql | undefined;

export function getSql(): Sql {
  if (!sql) {
    sql = neon(config.databaseUrl());
  }
  return sql;
}
