"""
---------------------------------------------------------
File: model.py
Location: services/minigpt-service/model.py
---------------------------------------------------------

Purpose:
  A pure NumPy implementation of a Causal Generative Pre-trained Transformer (GPT).
  Implements the complete forward pass, backward backpropagation pass, Adam optimizer,
  and text sampler from scratch.

Responsibilities:
- Implements SimpleCharTokenizer mapping characters to integer IDs.
- Implements LayerNorm and GELU activations.
- Implements multi-head causal self-attention with causal masking.
- Implements backpropagation through all layers (MLP, Attention, Embeddings).
- Implements Adam parameter updates with gradient clipping.
- Implements autoregressive text generation using Temperature and Top-K sampling.

Related Files:
- services/minigpt-service/main.py (Invokes LabSession wrappers)
"""

from __future__ import annotations
import numpy as np

class SimpleCharTokenizer:
    """
    A simple character-level tokenizer.
    Maps characters to integer IDs and vice versa.
    """
    def __init__(self, text: str):
        self.chars = sorted(list(set(text)))
        if not self.chars:
            self.chars = [" "]  # Fallback for empty corpus
        self.vocab_size = len(self.chars)
        self.stoi = {ch: i for i, ch in enumerate(self.chars)}
        self.itos = {i: ch for i, ch in enumerate(self.chars)}

    def encode(self, s: str) -> list[int]:
        return [self.stoi.get(c, 0) for c in s]

    def decode(self, ids: list[int]) -> str:
        return "".join([self.itos.get(i, " ") for i in ids])

def gelu_forward(x):
    """
    GELU activation function (Gaussian Error Linear Unit) used in GPT-2.
    Equation: 0.5 * x * (1.0 + tanh(sqrt(2 / pi) * (x + 0.044715 * x^3)))
    GELU allows small negative gradients to flow back, avoiding dead neurons.
    """
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x ** 3)))

def gelu_backward(dout, x):
    """
    Backward pass gradient calculation for GELU.
    """
    tanh_arg = np.sqrt(2.0 / np.pi) * (x + 0.044715 * x ** 3)
    tanh_val = np.tanh(tanh_arg)
    dtanh = 1.0 - tanh_val ** 2
    sech2_term = dtanh * np.sqrt(2.0 / np.pi) * (1.0 + 3.0 * 0.044715 * x ** 2)
    dgelu = 0.5 * (1.0 + tanh_val) + 0.5 * x * sech2_term
    return dout * dgelu

def layernorm_forward(x, gamma, beta, eps=1e-5):
    """
    Layer Normalization (Forward pass).
    Normalizes the inputs across the last dimension.
    Formula: x_norm = (x - mean) / sqrt(var + eps)
             out = gamma * x_norm + beta
    """
    mean = np.mean(x, axis=-1, keepdims=True)
    var = np.var(x, axis=-1, keepdims=True)
    x_norm = (x - mean) / np.sqrt(var + eps)
    out = gamma * x_norm + beta
    cache = (x, mean, var, x_norm, gamma)
    return out, cache

def layernorm_backward(dout, cache, eps=1e-5):
    """
    Layer Normalization (Backward pass).
    Calculates gradients for scale (dgamma), shift (dbeta), and inputs (dx).
    """
    x, mean, var, x_norm, gamma = cache
    C = x.shape[-1]
    
    dgamma = np.sum(dout * x_norm, axis=(0, 1))
    dbeta = np.sum(dout, axis=(0, 1))
    
    dx_norm = dout * gamma
    dx = (1.0 / C) / np.sqrt(var + eps) * (
        C * dx_norm - 
        np.sum(dx_norm, axis=-1, keepdims=True) - 
        x_norm * np.sum(dx_norm * x_norm, axis=-1, keepdims=True)
    )
    return dx, dgamma, dbeta

class NumPyCausalGPT:
    """
    NumPy-only Causal GPT Model.
    Exposes complete forward/backward computation passes.
    """
    def __init__(self, vocab_size: int, n_layer: int, n_head: int, n_embd: int, block_size: int):
        self.vocab_size = vocab_size
        self.n_layer = n_layer
        self.n_head = n_head
        self.n_embd = n_embd
        self.block_size = block_size
        
        # Initialize Token Embeddings (Wte) and Positional Embeddings (Wpe)
        self.Wte = np.random.randn(vocab_size, n_embd) * 0.02
        self.Wpe = np.random.randn(block_size, n_embd) * 0.02
        
        # Initialize LayerNorm parameters for final output
        self.gamma_f = np.ones((n_embd,))
        self.beta_f = np.zeros((n_embd,))
        
        # Initialize weights for each Transformer block
        for i in range(n_layer):
            # Pre-Attention and Pre-MLP LayerNorms
            setattr(self, f"gamma1_{i}", np.ones((n_embd,)))
            setattr(self, f"beta1_{i}", np.zeros((n_embd,)))
            setattr(self, f"gamma2_{i}", np.ones((n_embd,)))
            setattr(self, f"beta2_{i}", np.zeros((n_embd,)))
            
            # Query, Key, and Value weights (packed as n_embd x n_embd matrices)
            setattr(self, f"Wq_{i}", np.random.randn(n_embd, n_embd) / np.sqrt(n_embd))
            setattr(self, f"Wk_{i}", np.random.randn(n_embd, n_embd) / np.sqrt(n_embd))
            setattr(self, f"Wv_{i}", np.random.randn(n_embd, n_embd) / np.sqrt(n_embd))
            
            # Attention output projection weight
            setattr(self, f"Wo_{i}", np.random.randn(n_embd, n_embd) / np.sqrt(n_embd))
            
            # MLP Feedforward network (hidden dimension is 4 * n_embd)
            setattr(self, f"W1_{i}", np.random.randn(n_embd, 4 * n_embd) / np.sqrt(n_embd))
            setattr(self, f"b1_{i}", np.zeros((1, 4 * n_embd)))
            setattr(self, f"W2_{i}", np.random.randn(4 * n_embd, n_embd) / np.sqrt(4 * n_embd))
            setattr(self, f"b2_{i}", np.zeros((1, n_embd)))
            
        # Language Model Head (projects embeddings back to vocabulary logits)
        self.Wlm = np.random.randn(n_embd, vocab_size) / np.sqrt(n_embd)
        
        # Adam Optimizer states (mean and variance cache dictionaries)
        self.m = {}
        self.v = {}
        self.t = 0

    def forward(self, idx: np.ndarray) -> tuple[np.ndarray, dict]:
        """
        Executes the Forward Pass of the GPT model.
        
        Tensors layout:
        - B: Batch size.
        - T: Context sequence length.
        - C: n_embd (Embedding size).
        - h: n_head (Attention heads count).
        - d: C // h (Dimension size per head).
        """
        B, T = idx.shape
        assert T <= self.block_size, f"Context length {T} exceeds block size {self.block_size}"
        
        # Compute Embeddings: Token embeddings + Positional embeddings
        tok_emb = self.Wte[idx]  # Shape: (B, T, n_embd)
        pos = np.arange(T)
        pos_emb = self.Wpe[pos]  # Shape: (T, n_embd)
        z = tok_emb + pos_emb  # Shape: (B, T, n_embd)
        
        cache = {"idx": idx, "z_0": z}
        
        h = self.n_head
        d = self.n_embd // h
        scale = 1.0 / np.sqrt(d)
        mask = np.tril(np.ones((T, T)))  # Causal mask (lower triangle matrix)
        
        for i in range(self.n_layer):
            Wq = getattr(self, f"Wq_{i}")
            Wk = getattr(self, f"Wk_{i}")
            Wv = getattr(self, f"Wv_{i}")
            Wo = getattr(self, f"Wo_{i}")
            W1 = getattr(self, f"W1_{i}")
            b1 = getattr(self, f"b1_{i}")
            W2 = getattr(self, f"W2_{i}")
            b2 = getattr(self, f"b2_{i}")
            
            gamma1 = getattr(self, f"gamma1_{i}")
            beta1 = getattr(self, f"beta1_{i}")
            gamma2 = getattr(self, f"gamma2_{i}")
            beta2 = getattr(self, f"beta2_{i}")
            
            z_in = z
            
            # LayerNorm 1 (Pre-Attention LayerNorm)
            ln1, ln1_cache = layernorm_forward(z_in, gamma1, beta1)
            
            # Project Q, K, V matrices
            Q = ln1 @ Wq  # (B, T, C)
            K = ln1 @ Wk  # (B, T, C)
            V = ln1 @ Wv  # (B, T, C)
            
            # Reshape and split heads: (B, T, h, d) -> transpose to (B, h, T, d)
            Q_heads = Q.reshape(B, T, h, d).transpose(0, 2, 1, 3)
            K_heads = K.reshape(B, T, h, d).transpose(0, 2, 1, 3)
            V_heads = V.reshape(B, T, h, d).transpose(0, 2, 1, 3)
            
            # Scaled Dot-Product Self-Attention: Q @ K^T / sqrt(d)
            scores = (Q_heads @ K_heads.transpose(0, 1, 3, 2)) * scale  # (B, h, T, T)
            
            # Causal Masking: Fill upper triangle elements with -infinity so softmax outputs 0
            scores = np.where(mask == 0, -np.inf, scores)
            
            # Softmax calculation
            exp_scores = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
            A = exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)  # (B, h, T, T)
            
            # Multiply by Value matrix: Y = Attention_matrix @ V
            Y_heads = A @ V_heads  # (B, h, T, d)
            
            # Concatenate heads back: (B, h, T, d) -> transpose to (B, T, h, d) -> reshape (B, T, C)
            Y = Y_heads.transpose(0, 2, 1, 3).reshape(B, T, self.n_embd)
            
            # Attention Projection & Residual connection
            attn_out = Y @ Wo
            z_mid = z_in + attn_out  # First residual add connection
            
            # LayerNorm 2 (Pre-MLP LayerNorm)
            ln2, ln2_cache = layernorm_forward(z_mid, gamma2, beta2)
            
            # Feedforward MLP network with GELU activation
            h_mlp = ln2 @ W1 + b1
            h_gelu = gelu_forward(h_mlp)
            mlp_out = h_gelu @ W2 + b2
            
            # MLP Residual connection
            z_out = z_mid + mlp_out  # Second residual add connection
            
            # Cache activations to use during backpropagation passes
            cache.update({
                f"z_in_{i}": z_in, f"ln1_cache_{i}": ln1_cache, f"ln1_{i}": ln1,
                f"Q_{i}": Q, f"K_{i}": K, f"V_{i}": V,
                f"Q_heads_{i}": Q_heads, f"K_heads_{i}": K_heads, f"V_heads_{i}": V_heads,
                f"scores_{i}": scores, f"A_{i}": A, f"Y_heads_{i}": Y_heads, f"Y_{i}": Y,
                f"attn_out_{i}": attn_out, f"z_mid_{i}": z_mid,
                f"ln2_cache_{i}": ln2_cache, f"ln2_{i}": ln2,
                f"h_mlp_{i}": h_mlp, f"h_gelu_{i}": h_gelu, f"mlp_out_{i}": mlp_out,
                f"z_out_{i}": z_out
            })
            
            z = z_out
            
        # Final output LayerNorm
        z_final, ln_f_cache = layernorm_forward(z, self.gamma_f, self.beta_f)
        logits = z_final @ self.Wlm
        
        cache.update({
            "z_final_pre_ln": z,
            "ln_f_cache": ln_f_cache,
            "z_final": z_final
        })
        
        return logits, cache

    def backward(self, cache: dict, targets: np.ndarray) -> dict:
        """
        Executes the Backward Pass (Backpropagation).
        Computes gradients for all model parameters (weights and biases).
        """
        idx = cache["idx"]
        B, T = idx.shape
        h = self.n_head
        d = self.n_embd // h
        scale = 1.0 / np.sqrt(d)
        
        # Softmax CrossEntropy Loss gradient
        logits = cache["z_final"] @ self.Wlm
        exp_logits = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)
        
        dlogits = probs.copy()
        for b in range(B):
            for t in range(T):
                target_idx = targets[b, t]
                dlogits[b, t, target_idx] -= 1.0
        dlogits = dlogits / (B * T)
        
        # LM Head gradients
        dWlm = np.tensordot(cache["z_final"], dlogits, axes=([0, 1], [0, 1]))
        dz_final = dlogits @ self.Wlm.T
        
        # Backprop through final LayerNorm
        dz, dgamma_f, dbeta_f = layernorm_backward(dz_final, cache["ln_f_cache"])
        
        grads = {
            "Wlm": dWlm,
            "gamma_f": dgamma_f,
            "beta_f": dbeta_f
        }
        
        # Backpropagate through layers in reverse order
        for i in reversed(range(self.n_layer)):
            Wq = getattr(self, f"Wq_{i}")
            Wk = getattr(self, f"Wk_{i}")
            Wv = getattr(self, f"Wv_{i}")
            Wo = getattr(self, f"Wo_{i}")
            W1 = getattr(self, f"W1_{i}")
            W2 = getattr(self, f"W2_{i}")
            
            z_in = cache[f"z_in_{i}"]
            ln1_cache = cache[f"ln1_cache_{i}"]
            ln1 = cache[f"ln1_{i}"]
            Q_heads = cache[f"Q_heads_{i}"]
            K_heads = cache[f"K_heads_{i}"]
            V_heads = cache[f"V_heads_{i}"]
            A = cache[f"A_{i}"]
            Y = cache[f"Y_{i}"]
            z_mid = cache[f"z_mid_{i}"]
            ln2_cache = cache[f"ln2_cache_{i}"]
            ln2 = cache[f"ln2_{i}"]
            h_mlp = cache[f"h_mlp_{i}"]
            h_gelu = cache[f"h_gelu_{i}"]
            
            # Residual connection split: z_out = z_mid + mlp_out
            dmlp_out = dz.copy()
            dz_mid = dz.copy()
            
            # Backprop MLP projections
            dW2 = np.tensordot(h_gelu, dmlp_out, axes=([0, 1], [0, 1]))
            db2 = np.sum(dmlp_out, axis=(0, 1)).reshape(1, -1)
            dh_gelu = dmlp_out @ W2.T
            
            # Backprop GELU activation
            dh_mlp = gelu_backward(dh_gelu, h_mlp)
            
            dW1 = np.tensordot(ln2, dh_mlp, axes=([0, 1], [0, 1]))
            db1 = np.sum(dh_mlp, axis=(0, 1)).reshape(1, -1)
            dln2 = dh_mlp @ W1.T
            
            # Backprop through LayerNorm 2
            dz_mid_from_mlp, dgamma2, dbeta2 = layernorm_backward(dln2, ln2_cache)
            dz_mid += dz_mid_from_mlp
            
            # Residual connection split: z_mid = z_in + attn_out
            dattn_out = dz_mid.copy()
            dz_in = dz_mid.copy()
            
            # Backprop through Attention outputs
            dWo = np.tensordot(Y, dattn_out, axes=([0, 1], [0, 1]))
            dY = dattn_out @ Wo.T
            
            dY_heads = dY.reshape(B, T, h, d).transpose(0, 2, 1, 3)
            
            dA = dY_heads @ V_heads.transpose(0, 1, 3, 2)
            dV_heads = A.transpose(0, 1, 3, 2) @ dY_heads
            
            dA_sum = np.sum(dA * A, axis=-1, keepdims=True)
            dscores = A * (dA - dA_sum)
            dscores = np.where(np.tril(np.ones((T, T))) == 0, 0.0, dscores)
            
            dQ_heads = (dscores @ K_heads) * scale
            dK_heads = (dscores.transpose(0, 1, 3, 2) @ Q_heads) * scale
            
            dQ = dQ_heads.transpose(0, 2, 1, 3).reshape(B, T, self.n_embd)
            dK = dK_heads.transpose(0, 2, 1, 3).reshape(B, T, self.n_embd)
            dV = dV_heads.transpose(0, 2, 1, 3).reshape(B, T, self.n_embd)
            
            dWq = np.tensordot(ln1, dQ, axes=([0, 1], [0, 1]))
            dWk = np.tensordot(ln1, dK, axes=([0, 1], [0, 1]))
            dWv = np.tensordot(ln1, dV, axes=([0, 1], [0, 1]))
            
            dln1 = dQ @ Wq.T + dK @ Wk.T + dV @ Wv.T
            
            # Backprop through LayerNorm 1
            dz_in_from_attn, dgamma1, dbeta1 = layernorm_backward(dln1, ln1_cache)
            dz_in += dz_in_from_attn
            
            dz = dz_in
            
            grads.update({
                f"Wq_{i}": dWq, f"Wk_{i}": dWk, f"Wv_{i}": dWv, f"Wo_{i}": dWo,
                f"W1_{i}": dW1, f"b1_{i}": db1, f"W2_{i}": dW2, f"b2_{i}": db2,
                f"gamma1_{i}": dgamma1, f"beta1_{i}": dbeta1,
                f"gamma2_{i}": dgamma2, f"beta2_{i}": dbeta2
            })
            
        # Token and Position Embedding gradients (vectorized)
        dWte = np.zeros_like(self.Wte)
        np.add.at(dWte, idx.reshape(-1), dz.reshape(-1, self.n_embd))
        
        # Positional embedding gradient (sum over batch)
        dWpe = np.zeros_like(self.Wpe)
        for t in range(T):
            dWpe[t] = dz[:, t, :].sum(axis=0)
            
        grads.update({"Wte": dWte, "Wpe": dWpe})
        return grads

    def clip_grad_norm_(self, grads: dict, max_norm: float = 1.0) -> float:
        """
        Gradient clipping. Scales gradients down if the L2 global norm exceeds max_norm.
        This prevents gradients from exploding during early training phases.
        """
        total_norm = np.sqrt(sum(np.sum(g ** 2) for g in grads.values()))
        if total_norm > max_norm:
            clip_coeff = max_norm / (total_norm + 1e-8)
            for name in grads:
                grads[name] = grads[name] * clip_coeff
        return float(total_norm)

    def update_params(self, grads: dict, lr: float):
        """
        Applies parameter updates using the Adam Optimizer.
        Formula: m = beta1 * m + (1 - beta1) * grad
                 v = beta2 * v + (1 - beta2) * grad^2
                 m_hat = m / (1 - beta1^t)  (bias correction)
                 v_hat = v / (1 - beta2^t)  (bias correction)
                 param = param - lr * m_hat / (sqrt(v_hat) + eps)
        """
        self.t += 1
        beta1, beta2 = 0.9, 0.999
        eps = 1e-8
        
        for name, grad in grads.items():
            param = getattr(self, name)
            
            if name not in self.m:
                self.m[name] = np.zeros_like(param)
                self.v[name] = np.zeros_like(param)
                
            self.m[name] = beta1 * self.m[name] + (1 - beta1) * grad
            self.v[name] = beta2 * self.v[name] + (1 - beta2) * (grad ** 2)
            
            m_hat = self.m[name] / (1 - beta1 ** self.t)
            v_hat = self.v[name] / (1 - beta2 ** self.t)
            
            new_val = param - lr * m_hat / (np.sqrt(v_hat) + eps)
            setattr(self, name, new_val)

class LabSession:
    """
    Session manager containing datasets and evaluation loops for the simulator dashboard.
    """
    def __init__(self, text: str, n_layer: int = 2, n_head: int = 4, n_embd: int = 64, block_size: int = 32):
        self.text = text
        self.tokenizer = SimpleCharTokenizer(text)
        
        # Enforce clean parameters bounds to prevent browser memory exhaustion
        n_layer = max(1, min(n_layer, 4))
        n_embd = max(16, min(n_embd, 128))
        block_size = max(8, min(block_size, 64))
        n_head = max(1, min(n_head, 8))
        
        # Ensure embedding size is divisible by the attention head count
        if n_embd % n_head != 0:
            divisors = [i for i in range(1, n_embd + 1) if n_embd % i == 0]
            n_head = min(divisors, key=lambda x: abs(x - n_head))
            
        self.n_layer = n_layer
        self.n_head = n_head
        self.n_embd = n_embd
        self.block_size = block_size
        
        self.model = NumPyCausalGPT(
            vocab_size=self.tokenizer.vocab_size,
            n_layer=self.n_layer,
            n_head=self.n_head,
            n_embd=self.n_embd,
            block_size=self.block_size
        )
        
        # Split data: 90% for training, 10% for validation evaluation
        data = self.tokenizer.encode(self.text)
        n = int(0.9 * len(data))
        self.train_data = np.array(data[:n], dtype=np.int32)
        self.val_data = np.array(data[n:], dtype=np.int32)
        
        self.loss_history: list[dict] = []
        self.step_counter = 0

    def get_batch(self, split: str, batch_size: int) -> tuple[np.ndarray, np.ndarray]:
        """
        Samples a random batch of inputs (x) and targets (y) from the dataset.
        For each sequence index `i`, y is offset by 1: `x = data[i:i+T]`, `y = data[i+1:i+T+1]`.
        """
        data = self.train_data if split == "train" else self.val_data
        if len(data) <= self.block_size + 1:
            x = np.zeros((batch_size, self.block_size), dtype=np.int32)
            y = np.zeros((batch_size, self.block_size), dtype=np.int32)
            return x, y
            
        ix = np.random.randint(0, len(data) - self.block_size, size=(batch_size,))
        x = np.stack([data[i:i+self.block_size] for i in ix])
        y = np.stack([data[i+1:i+self.block_size+1] for i in ix])
        return x, y

    def _cross_entropy_loss(self, logits: np.ndarray, targets: np.ndarray) -> float:
        """
        Computes the average negative log likelihood cross-entropy loss.
        """
        B, T, C = logits.shape
        exp_logits = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)
        # Gather probabilities corresponding to the target character indexes
        log_probs = np.log(probs.reshape(B * T, C)[np.arange(B * T), targets.reshape(-1)] + 1e-15)
        return float(-log_probs.mean())

    def train_step(self, lr: float = 1e-2, batch_size: int = 16, steps: int = 1) -> dict:
        """
        Performs training steps consisting of forward, backward, clipping, and param updates.
        """
        accumulated_loss = 0.0
        last_grad_norm = 0.0
        for _ in range(steps):
            x, y = self.get_batch("train", batch_size)
            logits, cache = self.model.forward(x)
            
            # Compute loss
            loss = self._cross_entropy_loss(logits, y)
            
            # Backpropagation
            grads = self.model.backward(cache, y)
            
            # Gradient clipping (max_norm=1.0 prevents divergence)
            last_grad_norm = self.model.clip_grad_norm_(grads, max_norm=1.0)
            
            # Apply parameter updates
            self.model.update_params(grads, lr)
            
            accumulated_loss += loss
            self.step_counter += 1
        
        # Evaluate validation loss every 5 steps to save compute cycles
        if self.step_counter % 5 == 0 or not hasattr(self, "_last_val_loss"):
            val_loss = self.evaluate_val_loss(batch_size=batch_size)
            self._last_val_loss = val_loss
        else:
            val_loss = self._last_val_loss
            
        mean_train_loss = accumulated_loss / steps
        
        self.loss_history.append({
            "step": self.step_counter,
            "trainLoss": mean_train_loss,
            "valLoss": val_loss
        })
        
        return {
            "step": self.step_counter,
            "trainLoss": mean_train_loss,
            "valLoss": val_loss,
            "gradNorm": last_grad_norm,
            "lossHistory": self.loss_history
        }

    def evaluate_val_loss(self, batch_size: int = 16) -> float:
        x, y = self.get_batch("val", batch_size)
        logits, _ = self.model.forward(x)
        return self._cross_entropy_loss(logits, y)

    def generate(self, seed: str, max_new_tokens: int = 50, temperature: float = 1.0, top_k: int = 10) -> dict:
        """
        Generates text using temperature scaling and Top-K sampling.
        
        Sampling logic:
        - If temperature == 0: Selects the token with the highest logit value (deterministic/greedy decoding).
        - If temperature > 0: Scales logits by temperature (`logits / temp`), isolates the top-K highest values,
          zeros out the rest (replaces them with -inf), computes softmax probability weights, and samples a token.
        """
        if not seed:
            seed = " "
            
        seed_encoded = self.tokenizer.encode(seed)
        input_tokens = list(seed_encoded)
        
        generated_tokens = []
        for _ in range(max_new_tokens):
            # Truncate context to model's maximum context length (block_size)
            context_tokens = input_tokens[-self.block_size:]
            x = np.array([context_tokens], dtype=np.int32)
            
            logits, _ = self.model.forward(x)
            last_logits = logits[0, -1, :]  # Grab logits for the very last token
            
            if temperature == 0.0:
                next_token_id = int(np.argmax(last_logits))
            else:
                last_logits = last_logits / temperature
                # Top-K Sampling: Filter out low-probability tokens to maintain output coherence
                k = min(top_k, len(last_logits))
                top_k_threshold = np.sort(last_logits)[-k]
                last_logits = np.where(last_logits < top_k_threshold, -np.inf, last_logits)
                exp_logits = np.exp(last_logits - np.max(last_logits))
                probs = exp_logits / np.sum(exp_logits)
                next_token_id = int(np.random.choice(len(probs), p=probs))
                
            input_tokens.append(next_token_id)
            generated_tokens.append(next_token_id)
            
        full_text = self.tokenizer.decode(input_tokens)
        new_text = self.tokenizer.decode(generated_tokens)
        
        # Extract self-attention maps for visualization in the lab dashboard
        final_context = input_tokens[-self.block_size:]
        x_final = np.array([final_context], dtype=np.int32)
        _, cache = self.model.forward(x_final)
        
        formatted_maps = []
        for layer_idx in range(self.n_layer):
            layer_data = []
            A_layer = cache[f"A_{layer_idx}"][0]  # Shape: (h, T, T)
            for head_idx in range(self.n_head):
                layer_data.append(A_layer[head_idx].tolist())
            formatted_maps.append(layer_data)
            
        tokens_labels = [self.tokenizer.itos.get(tok_id, " ") for tok_id in final_context]
        
        return {
            "seed": seed,
            "generatedText": new_text,
            "fullText": full_text,
            "tokens": final_context,
            "tokenLabels": tokens_labels,
            "attentionMaps": formatted_maps  # Matrix matching dimensions: [layer][head][query][key]
        }
