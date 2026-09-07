# AI Annotation Studio

Professional browser-based AI image annotation platform.

## Features

- Customer image upload
- 2D bounding boxes
- Polygon annotations
- Semantic/image segmentation
- Browser-based AI inference
- Confidence thresholds
- Annotation rule storage
- Automatic quality checks
- Human correction workflow
- Undo/redo
- Annotation selection
- Annotation deletion
- JSON export
- Annotated PNG export
- Training-data collection
- Annotation history
- No Supabase
- No API key
- No server required for the basic version

## AI

The application uses Hugging Face Transformers.js.

The AI models run in the user's browser.

Object detection:

Xenova/detr-resnet-50

Segmentation:

Xenova/detr-resnet-50-panoptic

## Running locally

Because browser security restrictions can prevent ES modules from working
correctly when opening index.html directly, use a local web server.

For example:

Python:

python -m http.server 8000

Then open:

http://localhost:8000

## GitHub Pages

Push:

index.html
styles.css
app.js
README.md
.gitignore

to a GitHub repository.

Then:

Settings
→ Pages
→ Deploy from branch
→ main
→ /root
→ Save

GitHub Pages will publish the application.

## Important

The first AI run downloads the model into the browser cache.

The initial model download can be large and inference speed depends on
the user's computer/browser.

## Training

Human corrections are saved as local training examples.

Export:

Learning Data
→ Export Training Data

The exported dataset can later be used to train a custom customer-specific
computer vision model.

## Production architecture

For a production annotation company, replace the browser-only learning
storage with a secure backend and model-training service.

Recommended architecture:

Browser
↓
Annotation Editor
↓
AI Inference
↓
Rule Engine
↓
Human Review
↓
Training Dataset
↓
Model Training
↓
New Model Version
↓
AI Inference

## Accuracy

No automatic computer-vision system should be treated as 100% accurate.

The production workflow should use:

AI prediction
+
confidence
+
customer rules
+
automatic validation
+
human review

for production-quality annotations.
