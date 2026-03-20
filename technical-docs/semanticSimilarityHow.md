# How does the MiniLM model run: 

The app runs a mini AI model entirely in your browser, no server needed.
When you first open it, it downloads a 23MB model file from Hugging Face and saves it to IndexedDB so it never has to download again. That model is in ONNX format — a universal portable format for ML models.
To actually run the model, it uses ONNX Runtime compiled to WASM, which lets heavy C++ math code execute inside the browser at near-native speed. If your CPU supports SIMD, it loads the faster version that does 8 operations at once instead of 1.
The model itself is a transformer — a neural network that converts text into vectors by having each token look at all other tokens, figure out which ones are contextually related (via dot products of Q/K/V matrices), and update itself accordingly. That's how "it" knows it refers to "animal" and not "street."
The output is a 384-dimensional vector per piece of text. To group similar names together, you just compare how close those vectors are — similar meaning = similar direction in vector space.
The whole point of the stack is that it's local, free, and private. The tradeoff is you can only run tiny models, but for semantic similarity that's all you need.