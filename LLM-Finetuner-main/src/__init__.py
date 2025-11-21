import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize database
db = SQLAlchemy()

# Models will be imported after db is initialized to avoid circular imports

def create_app():
    # Initialize Flask app
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    # Load configuration
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize database and migration tools
    db.init_app(app)
    Migrate(app, db)

    return app