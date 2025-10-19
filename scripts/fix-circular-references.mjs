#!/usr/bin/env node

/**
 * Fix circular references in Firestore lines data
 *
 * This script removes branchFromMessageId from lines that cause
 * circular parent-child relationships.
 *
 * Strategy:
 * - For each circular reference, break the cycle by removing
 *   the branchFromMessageId from the line that creates the loop
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import readline from 'readline'

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
 * Prompt user for confirmation
 */
function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * Fix circular references
 */
async function fixCircularReferences() {
  console.log('🔧 Fixing circular references...\n')

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

  // Detect circular references
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

  if (circularLines.length === 0) {
    console.log('✅ No circular references found!')
    process.exit(0)
  }

  console.log(`🔴 Found ${circularLines.length} circular reference(s):\n`)

  // Determine which lines to fix
  const linesToFix = new Set()

  for (const item of circularLines) {
    console.log(`Circular path for: ${lines[item.lineId]?.name}`)
    for (let i = 0; i < item.path.length; i++) {
      const id = item.path[i]
      const line = lines[id]
      console.log(`  ${i + 1}. ${line?.name || 'Unknown'} (${id})`)

      // The line that creates the loop (last one in path that points back)
      if (i === item.path.length - 1) {
        linesToFix.add(id)
        console.log(`     🔧 Will remove branchFromMessageId from this line`)
      } else if (line?.branchFromMessageId) {
        console.log(`     └─ branches from message: ${line.branchFromMessageId}`)
      }
    }
    console.log()
  }

  // Show what will be fixed
  console.log(`\n📝 Lines to be fixed (${linesToFix.size}):\n`)
  for (const lineId of linesToFix) {
    const line = lines[lineId]
    console.log(`  - ${line.name} (${lineId})`)
    console.log(`    Current branchFromMessageId: ${line.branchFromMessageId}`)
    console.log(`    Will be set to: null\n`)
  }

  // Ask for confirmation
  const shouldProceed = await confirm('Do you want to proceed with the fix? (y/n): ')

  if (!shouldProceed) {
    console.log('❌ Operation cancelled')
    process.exit(0)
  }

  // Apply fixes
  console.log('\n🔧 Applying fixes...\n')

  const batch = db.batch()
  let updateCount = 0

  for (const lineId of linesToFix) {
    const lineRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('lines')
      .doc(lineId)

    batch.update(lineRef, {
      branchFromMessageId: admin.firestore.FieldValue.delete()
    })

    updateCount++
    console.log(`✓ Updated: ${lines[lineId].name} (${lineId})`)
  }

  await batch.commit()

  console.log(`\n✅ Successfully fixed ${updateCount} line(s)!`)
  console.log('Please reload your application to see the changes.\n')

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

fixCircularReferences().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
