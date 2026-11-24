export interface DispatchParams {
  runId: string;
  mode: "reuse_cv" | "new_cv" | "new_research" | "scheduled";
  skipScrape: boolean;
}

export async function triggerGitHubScrapeWorkflow(
  params: DispatchParams
): Promise<{ triggered: boolean; message: string }> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflowFile = process.env.GITHUB_WORKFLOW_FILE || "scrape-and-match.yml";
  const ref = process.env.GITHUB_REF || "main";

  if (!token || !owner || !repo) {
    return {
      triggered: false,
      message:
        "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO belum diset. Record run tetap tersimpan di Supabase; Anda bisa jalankan worker secara manual atau lengkapi env Vercel.",
    };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        run_id: params.runId,
        mode: params.mode,
        skip_scrape: params.skipScrape ? "true" : "false",
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GitHub Actions dispatch gagal (${resp.status}): ${errText}`);
  }

  return {
    triggered: true,
    message: "Worker GitHub Actions berhasil dipicu dan sedang berjalan di server.",
  };
}
