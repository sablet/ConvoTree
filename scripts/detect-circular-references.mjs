#!/usr/bin/env node

/**
 * Detect circular references in Firestore lines data
 *
 * This script checks for circular parent-child relationships
 * that cause infinite loops in line ancestry calculations.
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(new URL('../firebase-service-account.json', import.meta.url))
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const conversationId = 'chat-minimal-conversation-1'

/**
 * Detect circular references in line ancestry
 */
async function detectCircularReferences() {
  console.log('🔍 Checking for circular references...\n')

  // Fetch all lines and messages
  const linesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('lines')
    .get()

  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .get()

  // Build maps
  const lines = {}
  linesSnapshot.forEach(doc => {
    lines[doc.id] = { id: doc.id, ...doc.data() }
  })

  const messages = {}
  messagesSnapshot.forEach(doc => {
    messages[doc.id] = { id: doc.id, ...doc.data() }
  })

  console.log(`📊 Total lines: ${Object.keys(lines).length}`)
  console.log(`📊 Total messages: ${Object.keys(messages).length}\n`)

  // Check each line for circular references
  const circularLines = []

  for (const lineId in lines) {
    const visited = new Set()
    const path = []

    if (hasCircularReference(lineId, lines, messages, visited, path)) {
      circularLines.push({
        lineId,
        path: [...path, lineId]
      })
    }
  }

  // Report results
  if (circularLines.length === 0) {
    console.log('✅ No circular references found!')
  } else {
    console.log(`🔴 Found ${circularLines.length} circular reference(s):\n`)

    for (const item of circularLines) {
      console.log(`Line: ${item.lineId} (${lines[item.lineId]?.name})`)
      console.log(`Circular path:`)
      for (let i = 0; i < item.path.length; i++) {
        const id = item.path[i]
        const line = lines[id]
        console.log(`  ${i + 1}. ${line?.name || 'Unknown'} (${id})`)
        if (i < item.path.length - 1) {
          const branchMsg = line?.branchFromMessageId
          if (branchMsg) {
            console.log(`     └─ branches from message: ${branchMsg}`)
          }
        }
      }
      console.log()
    }

    // Show recommended fix
    console.log('🔧 Recommended fix:')
    console.log('Run the fix script to remove circular references:')
    console.log('  node scripts/fix-circular-references.mjs\n')
  }

  process.exit(0)
}

/**
 * Check if a line has circular reference in its ancestry
 */
function hasCircularReference(lineId, lines, messages, visited, path) {
  const line = lines[lineId]
  if (!line) return false

  // Circular reference detected
  if (visited.has(lineId)) {
    return true
  }

  visited.add(lineId)
  path.push(lineId)

  // Check parent
  if (line.branchFromMessageId) {
    const branchFromMessage = messages[line.branchFromMessageId]
    if (branchFromMessage) {
      const parentLineId = branchFromMessage.lineId
      if (hasCircularReference(parentLineId, lines, messages, visited, path)) {
        return true
      }
    }
  }

  path.pop()
  visited.delete(lineId)
  return false
}

detectCircularReferences().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
