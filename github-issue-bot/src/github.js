import { Octokit } from '@octokit/rest';
import { verify } from '@octokit/webhooks-methods';

class GithubService {
  /*
   * @param {import('./environment').default} env
   */
  constructor(env) {
    this.env = env;
    this.octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
    });
  }

  /**
   * @param {*} req
   * @returns {Promise<boolean>}
   */
  async verifyWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];

    return (
      typeof signature !== 'string' ||
      (await verify(this.env.GITHUB_WEBHOOK_SECRET, req.bodyString, signature))
    );
  }

  /**
   * @param {any} issue
   * @param {string} comment
   */
  async postComment(issue, comment) {
    await this.octokit.issues.createComment({
      owner: issue.repository.owner.login,
      repo: issue.repository.name,
      issue_number: issue.number,
      body: comment,
    });
  }
}

export default GithubService;
