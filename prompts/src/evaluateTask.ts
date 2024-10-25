export function evaluateTask(params: {
  successCriteria?: string;
  failureCriteria?: string;
  needHumanHelpCriteria?: string;
}) {
  return `\
Important:
${params.successCriteria ? `- The success criteria is ${params.successCriteria}.` : ""}
${params.failureCriteria ? `- The failure criteria is ${params.failureCriteria}.` : ""}
${params.needHumanHelpCriteria ? `- The need human help criteria is ${params.needHumanHelpCriteria}.` : ""}
if any of these criteria are met, the task is considered done.\
you should output a message in the following format:

\`\`\`json
{
"taskStatus": "success" | "failure" | "needHumanHelp",
"reason": "The issue you're facing"
}
\`\`\`

if the task is not successful, clearly explain the reason you're facing and what you've tried so far.
`;
}
