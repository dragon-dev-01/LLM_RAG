"""Multi-tenant architecture migration

Revision ID: multi_tenant_001
Revises: 
Create Date: 2025-01-XX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'multi_tenant_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create tenants table
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    
    # Create base_models table
    op.create_table(
        'base_models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('model_type', sa.String(length=50), nullable=False),
        sa.Column('hf_model_id', sa.String(length=255), nullable=False),
        sa.Column('is_loaded', sa.Boolean(), nullable=True),
        sa.Column('loaded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Update users table
    op.add_column('users', sa.Column('tenant_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_users_tenant', 'users', 'tenants', ['tenant_id'], ['id'])
    op.drop_column('users', 'run_id')  # Remove old run_id
    
    # Create models table
    op.create_table(
        'models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('base_model_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('peft_r', sa.Integer(), nullable=True),
        sa.Column('peft_alpha', sa.Integer(), nullable=True),
        sa.Column('peft_dropout', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['base_model_id'], ['base_models.id'])
    )
    
    # Create lora_adapters table
    op.create_table(
        'lora_adapters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('model_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('adapter_path', sa.String(length=512), nullable=False),
        sa.Column('version', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['model_id'], ['models.id'])
    )
    
    # Create prompt_templates table
    op.create_table(
        'prompt_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('agent_role', sa.Text(), nullable=True),
        sa.Column('business_info', sa.Text(), nullable=True),
        sa.Column('specific_rules', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'])
    )
    
    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=False),
        sa.Column('file_path', sa.String(length=512), nullable=True),
        sa.Column('source_url', sa.String(length=512), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('chunk_count', sa.Integer(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'])
    )
    
    # Update runs table
    op.add_column('runs', sa.Column('model_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_runs_model', 'runs', 'models', ['model_id'], ['id'])
    op.add_column('runs', sa.Column('epochs', sa.Integer(), nullable=True))
    op.add_column('runs', sa.Column('learning_rate', sa.Float(), nullable=True))
    op.add_column('runs', sa.Column('warmup_ratio', sa.Float(), nullable=True))
    op.add_column('runs', sa.Column('optimizer', sa.String(length=100), nullable=True))
    op.add_column('runs', sa.Column('gradient_accumulation_steps', sa.Integer(), nullable=True))
    
    # Create indexes
    op.create_index('idx_models_tenant', 'models', ['tenant_id'])
    op.create_index('idx_documents_tenant', 'documents', ['tenant_id'])
    op.create_index('idx_prompt_templates_tenant', 'prompt_templates', ['tenant_id'])


def downgrade():
    op.drop_index('idx_prompt_templates_tenant')
    op.drop_index('idx_documents_tenant')
    op.drop_index('idx_models_tenant')
    
    op.drop_column('runs', 'gradient_accumulation_steps')
    op.drop_column('runs', 'optimizer')
    op.drop_column('runs', 'warmup_ratio')
    op.drop_column('runs', 'learning_rate')
    op.drop_column('runs', 'model_id')
    
    op.drop_table('documents')
    op.drop_table('prompt_templates')
    op.drop_table('lora_adapters')
    op.drop_table('models')
    
    op.add_column('users', sa.Column('run_id', sa.Integer(), nullable=True))
    op.drop_constraint('fk_users_tenant', 'users', type_='foreignkey')
    op.drop_column('users', 'tenant_id')
    
    op.drop_table('base_models')
    op.drop_table('tenants')

