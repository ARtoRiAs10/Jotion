/**
 * Where the local upload fallback stores its files.
 *
 * On a normal server the files live in `.jotion-uploads` next to the
 * application. On serverless platforms (Vercel, ...) the file system is
 * read-only and ephemeral, so the temporary directory is used instead — the
 * files then live as long as the instance does.
 *
 * Configure `EDGE_STORE_ACCESS_KEY` / `EDGE_STORE_SECRET_KEY` for a durable
 * storage in production.
 */
export const uploadDirectory = () => {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return "/tmp/jotion-uploads";
  }
  return `${process.cwd()}/.jotion-uploads`;
};
