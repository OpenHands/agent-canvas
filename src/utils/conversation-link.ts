export function buildConversationHref(
  conversationId: string,
  backendId: string,
  orgId: string | null,
): string {
  const params = new URLSearchParams();
  params.set("bid", backendId);
  if (orgId) params.set("oid", orgId);
  return `/conversations/${conversationId}?${params.toString()}`;
}
