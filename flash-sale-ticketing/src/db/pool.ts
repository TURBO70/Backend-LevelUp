import { Pool, QueryResult,QueryResultRow,PoolClient } from 'pg'
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

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}