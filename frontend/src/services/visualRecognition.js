import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

let model = null;

/**
 * Loads the MobileNet model.
 */
export const loadModel = async () => {
    if (model) return model;
    
    // We can use MobileNetV2 for good balance of speed and accuracy
    // or v3 if available in the library version.
    console.log('Loading MobileNet model...');
    model = await mobilenet.load({
        version: 2,
        alpha: 1.0
    });
    console.log('MobileNet model loaded.');
    return model;
};

/**
 * Generates an embedding (feature vector) for an image element.
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} element 
 * @returns {Promise<number[]>}
 */
export const getEmbedding = async (element) => {
    const net = await loadModel();
    
    // model.infer returns the internal activation of the penultimate layer
    // when the second argument is true.
    const embedding = tf.tidy(() => {
        const tensor = net.infer(element, true);
        return tensor.arraySync()[0];
    });
    
    return embedding;
};

/**
 * Calculates cosine similarity between two vectors.
 */
export const cosineSimilarity = (vecA, vecB) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Finds the best matches for a target embedding in a database of embeddings.
 * @param {number[]} targetEmbedding 
 * @param {Array<{Part_Number: string, Visual_Embedding: string}>} database 
 * @param {number} topK 
 */
export const findMatches = (targetEmbedding, database, topK = 3) => {
    const results = database
        .map(entry => {
            try {
                const vec = JSON.parse(entry.Visual_Embedding);
                if (!Array.isArray(vec)) return { ...entry, score: 0 };
                return {
                    ...entry,
                    score: cosineSimilarity(targetEmbedding, vec)
                };
            } catch (e) {
                return { ...entry, score: 0 };
            }
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);
    
    return results.slice(0, topK);
};
