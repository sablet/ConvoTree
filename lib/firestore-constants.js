/**
 * Firestore collection and subcollection names (CommonJS)
 * TypeScript版は firestore-constants.ts を参照
 */

// Top-level Collections
const CONVERSATIONS_COLLECTION = "conversations";

// Subcollections
const MESSAGES_SUBCOLLECTION = "messages";
const LINES_SUBCOLLECTION = "lines";
const TAGS_SUBCOLLECTION = "tags";
const TAG_GROUPS_SUBCOLLECTION = "tagGroups";

module.exports = {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
  TAGS_SUBCOLLECTION,
  TAG_GROUPS_SUBCOLLECTION,
};
