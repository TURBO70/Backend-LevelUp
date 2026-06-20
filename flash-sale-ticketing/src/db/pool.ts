import { Pool, QueryResult,QueryResultRow } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})


export const query = <T extends QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  return pool.query(text, params)
}