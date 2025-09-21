'use client';

import { useState } from 'react';
import { useTagContext } from '@/lib/tag-context';

export default function TagCrudTest() {
  const { state, actions } = useTagContext();
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3b82f6');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [result, setResult] = useState<string>('');

  const flatTags = state.tags.flatMap(tag =>
    tag.subtags ? [tag, ...tag.subtags] : [tag]
  );

  const handleCreateTag = async () => {
    try {
      setResult('Creating tag...');
      await actions.addTag({
        name: tagName,
        color: tagColor
      });
      setResult(`✅ Tag "${tagName}" created successfully`);
      setTagName('');
    } catch (error) {
      setResult(`❌ Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUpdateTag = async () => {
    if (!selectedTagId) {
      setResult('❌ Please select a tag to update');
      return;
    }

    try {
      setResult('Updating tag...');
      // flatTagsから選択されたタグを検索
      const selectedTag = flatTags.find(tag => tag.id === selectedTagId);
      if (!selectedTag) {
        setResult('❌ Selected tag not found in flat tags');
        return;
      }

      await actions.updateTag({
        ...selectedTag,
        name: tagName || selectedTag.name,
        color: tagColor
      });
      setResult(`✅ Tag updated successfully`);
    } catch (error) {
      setResult(`❌ Failed to update tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteTag = async () => {
    if (!selectedTagId) {
      setResult('❌ Please select a tag to delete');
      return;
    }

    try {
      setResult('Deleting tag...');
      await actions.deleteTag(selectedTagId);
      setResult(`✅ Tag deleted successfully`);
      setSelectedTagId('');
    } catch (error) {
      setResult(`❌ Failed to delete tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (state.isLoading) {
    return (
      <div className="p-4 border rounded-lg">
        <h2 className="text-lg font-semibold mb-2">🔄 Tag CRUD Test</h2>
        <p>Loading tags...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-4 border rounded-lg bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold mb-2 text-red-700">❌ Tag CRUD Test Error</h2>
        <p className="text-red-600">{state.error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
      <h2 className="text-lg font-semibold mb-4 text-blue-700">🏷️ Tag CRUD Test</h2>

      <div className="space-y-4">
        {/* Tag Input */}
        <div>
          <label className="block text-sm font-medium mb-1">Tag Name:</label>
          <input
            type="text"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Enter tag name"
          />
        </div>

        {/* Color Input */}
        <div>
          <label className="block text-sm font-medium mb-1">Tag Color:</label>
          <input
            type="color"
            value={tagColor}
            onChange={(e) => setTagColor(e.target.value)}
            className="w-full p-1 border rounded h-10"
          />
        </div>

        {/* Tag Selection for Update/Delete */}
        <div>
          <label className="block text-sm font-medium mb-1">Select Tag (for update/delete):</label>
          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select a tag...</option>
            {flatTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name} (Count: {tag.count})
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleCreateTag}
            disabled={!tagName.trim()}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-300 hover:bg-green-600"
          >
            Create Tag
          </button>
          <button
            onClick={handleUpdateTag}
            disabled={!selectedTagId}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          >
            Update Tag
          </button>
          <button
            onClick={handleDeleteTag}
            disabled={!selectedTagId}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300 hover:bg-red-600"
          >
            Delete Tag
          </button>
        </div>

        {/* Result Display */}
        {result && (
          <div className="p-3 bg-white border rounded">
            <strong>Result:</strong> {result}
          </div>
        )}

        {/* Current Tags Display */}
        <div className="mt-4">
          <h3 className="font-medium mb-2">Current Tags ({flatTags.length}):</h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {flatTags.length === 0 ? (
              <p className="text-gray-500">No tags available</p>
            ) : (
              flatTags.map((tag) => (
                <div key={tag.id} className="flex items-center space-x-2 p-2 bg-white border rounded text-sm">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: tag.color }}
                  ></div>
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-gray-500">(Count: {tag.count})</span>
                  <span className="text-xs text-gray-400">ID: {tag.id}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}