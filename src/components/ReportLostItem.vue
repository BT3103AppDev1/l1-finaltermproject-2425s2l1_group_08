<template>
  <div class="container">
    <form id="lost-form">
      <h2 id="header">Report Lost Item</h2>

      <div class="form-content">
        <!-- Back button navigation -->
        <div class="back-link">
          <i class="pi pi-arrow-left" id="backward-icon" @click="goBack"></i>
        </div>

        <br />

        <!-- Category selection -->
        <label for="category">Category </label> <br />
        <select 
          name="category" 
          id="category" 
          v-model="formData.category"
          @change="handleCategoryChange"
          required
        >
          <option value="">--Please choose the category--</option>
          <option value="Student Card">Student Card</option>
          <option value="Bank Card">Bank Card</option>
          <option value="Waterbottle">Waterbottle</option>
          <option value="Electronics">Electronics</option>
          <option value="Stationary">Stationary</option>
          <option value="Toys">Toys</option>
          <option value="Clothing">Clothing</option>
          <option value="Others">Others</option>
        </select>

        <br />
        <br />

        <!-- Color selection -->
        <label for="color">Colour</label><br />
        <template v-if="formData.category === 'Student Card'">
          <input 
            type="text" 
            id="color" 
            value="Colour not required for Student Cards" 
            disabled 
            class="placeholder-input"
          />
        </template>
        <template v-else>
          <select 
            v-model="formData.color" 
            id="color" 
            required
          >
            <option value="" disabled>--Please choose the colour--</option>
            <option value="Red">Red</option>
            <option value="Green">Green</option>
            <option value="Blue">Blue</option>
            <option value="Yellow">Yellow</option>
            <option value="Black">Black</option>
            <option value="White">White</option>
            <option value=" ">Others</option>
          </select>
        </template>
        <br /><br />

        <!-- Brand input field -->
        <label for="brand">Brand</label><br />
        <template v-if="formData.category === 'Student Card'">
          <input 
            type="text" 
            id="brand" 
            value="Not required for student cards" 
            disabled 
            class="placeholder-input"
          />
        </template>
        <template v-else>
          <input 
            type="text" 
            id="brand" 
            v-model="formData.brand" 
            required 
            placeholder="Enter Brand"
          />
        </template>
        <br /><br />

        <!-- Location input -->
        <label for="location">Location Lost </label> <br />
        <input 
          type="text" 
          id="location" 
          v-model="formData.location" 
          required 
          placeholder="Enter Location Lost" 
        />
        <br /><br />

        <!-- Date and time input -->
        <label for="datetime">Date & Time Lost </label> <br />
        <input 
          type="datetime-local" 
          id="datetime" 
          v-model="formData.datetime" 
          required 
          :max="maxDateTime" 
          placeholder="Enter Date & Time Lost" 
        />
        <br /><br />

        <!-- Description input -->
        <label for="description">Description </label> <br />
        <textarea 
          id="description" 
          v-model="formData.description" 
          rows="5" 
          cols="20" 
          required
          :placeholder="isStudentCard ? 'Enter name and student number on the card' : 'Enter Description'"
        ></textarea>

        <!-- Submit button -->
        <div class="submit-button-container">
          <button 
            id="submit-button" 
            type="button" 
            @click="saveLostItem"
          >
            Submit
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script>
import { collection, addDoc, doc, setDoc, arrayUnion, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useUserStore } from '@/stores/user-store';
import "primeicons/primeicons.css"

/**
* LostItemForm Component
* 
* A form for users to report lost items. The component handles:
* - Collecting item details (category, color, brand, etc.)
* - Form validation
* - Saving the data to Firestore
* - Special handling for student cards
* - Redirecting to a matching page after submission
*/
export default {
name: 'LostItemForm',

data() {
  return {
    // Form data object containing all fields
    formData: {
      category: '',
      color: '',
      brand: '',
      location: '',
      datetime: '', // Format: YYYY-MM-DDThh:mm
      description: '',
    },
    // Maximum allowed datetime is current time (can't report future losses)
    maxDateTime: new Date().toISOString().slice(0, 16),
  };
},

computed: {
  /**
   * Determines if the selected category is a Student Card
   * @returns {boolean} True if category is "Student Card"
   */
  isStudentCard() {
    return this.formData.category === 'Student Card';
  }
},

methods: {
  /**
   * Handles category change, setting defaults for student cards
   */
  handleCategoryChange() {
    if (this.isStudentCard) {
      this.formData.color = 'Colour not required for Student Cards';
      this.formData.brand = 'Not required for Student Cards';
    } else {
      // Reset these fields if switching from student card to another category
      if (this.formData.color === 'Colour not required for Student Cards') this.formData.color = '';
      if (this.formData.brand === 'Not required for Student Cards') this.formData.brand = '';
    }
  },

  /**
   * Validates the form data before submission
   * @returns {boolean} True if form is valid, false otherwise
   */
  validateForm() {
    const { category, color, brand, location, datetime, description } = this.formData;

    // Auto-fill some fields for Student Cards
    if (this.isStudentCard) {
      this.formData.color = 'Colour not required for Student Cards';
      this.formData.brand = 'Not required for Student Cards';
    }

    // Check required fields (excluding color and brand for Student Cards)
    if (!category || !location || !datetime || !description) {
      alert('Please fill all required fields.');
      return false;
    }

    // Check color and brand for non-Student Card items
    if (!this.isStudentCard && (!color || !brand || color.trim() === '' || brand.trim() === '')) {
      alert('Please fill all required fields (color and brand are required for non-Student Card items).');
      return false;
    }

    // Validate datetime is in the past
    const selectedDateTime = new Date(this.formData.datetime);
    const now = new Date();
    if (selectedDateTime > now) {
      alert('Date & Time must be in the past.');
      return false;
    }

    return true;
  },

  /**
   * Saves the lost item to Firestore and updates user history
   */
  async saveLostItem() {
    if (!this.validateForm()) return;
    
    try {
      const userStore = useUserStore();
      
      // Get user email from Firestore
      const userEmailRef = doc(db, 'users', userStore.userId);
      const docSnap = await getDoc(userEmailRef);
      
      if (!docSnap.exists()) {
        throw new Error('User data not found');
      }
      
      const userData = docSnap.data();
      const userEmail = userData.email;

      // Create item name based on category
      const itemName = this.isStudentCard 
        ? this.formData.category 
        : `${this.formData.color} ${this.formData.category}`;

      // Add the lost item to Firestore
      const docRef = await addDoc(collection(db, 'Lost Item'), {
        brand: this.formData.brand,
        category: this.formData.category,
        claimed_status: 'Not Found Yet',
        colour: this.formData.color,
        date_time_lost: this.formData.datetime,
        description: this.formData.description,
        lost_item_id: 'pending', // Will be updated after creation
        location: this.formData.location,
        name: itemName,
        email: userEmail,
        reporter_id: userStore.userId,
        already_similar_item: false,
        found_afterwards: true,
      });

      // Update the document with its own ID
      await updateDoc(docRef, {
        lost_item_id: docRef.id 
      });

      // Update user's history to include this lost item
      const userHistoryRef = doc(db, 'History', userStore.userId);
      await setDoc(
        userHistoryRef,
        {
          lost_item_id_list: arrayUnion(docRef.id),
        },
        { merge: true }
      );

      // Create a copy of form data for redirection
      const formDataCopy = { ...this.formData };
      
      // Reset the form
      this.resetForm();
      
      // Notify user and redirect
      alert('Item reported successfully! Redirecting to check for similar items found');
      
      const lostItemRef = await addDoc(collection(db, 'tempMatchingRequests'), {
        lostItem: JSON.stringify(formDataCopy), 
        timestamp: new Date()
      });

      this.$router.push({
        name: 'matching',
        query: { 
          lostItem: lostItemRef.id,
          id: docRef.id,
        }
      });

    } catch (error) {
      console.error('Error saving item:', error);
      alert(`Failed to report item: ${error.message}`);
    }
  },

  /**
   * Resets the form to initial values
   */
  resetForm() {
    this.formData = {
      category: '',
      color: '',
      brand: '',
      location: '',
      datetime: '',
      description: '',
    };
  },

  goBack() {
    this.$router.push('/');
  }
}
};
</script>

<style scoped>
.pi {
  font-family: 'primeicons';
}
/* Base styling */
* {
  font-family: 'Inter', sans-serif;
}

.container {
  margin-bottom: 2rem;
}

#header {
  font-size: 3rem;
  color: #684545;
  margin-bottom: 1.5rem;
}

/* Form styling */
form {
  text-align: center;
  margin: auto;
}

.form-content {
  display: inline-block;
  text-align: left;
  border-radius: 1rem;
  background-color: #fffdfb;
  width: 36.375rem;
  height: auto;
  padding-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Form elements styling */
.form-content label {
  margin-left: 5.8125rem;
  display: inline-block;
  width: 24.8125rem;
  height: 1.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.form-content input:not(:disabled),
.form-content select,
.form-content textarea {
  margin-left: 5.8125rem;
  width: 24.8125rem;
  height: 2rem;
  background-color: rgba(251, 240, 230, 1);
  letter-spacing: 0.42px;
  border-radius: 0.625rem;
  line-height: 2;
  border: none;
  box-sizing: border-box;
  color: black;
  padding-left: 0.75rem;
  font-size: 0.875rem;
}

.form-content textarea {
  height: 6.0625rem;
  min-width: 24.8125rem;
  max-width: 24.8125rem;
  resize: none;
}

/* Placeholder styling */
.form-content textarea::placeholder {
  color: #888;
  font-size: 0.875rem;
  text-align: left;
}

/* Submit button styling */
.submit-button-container {
  text-align: center;
  margin-top: 1.5rem;
}

#submit-button {
  width: 5.5rem;
  height: 2rem;
  border-radius: 0.625rem;
  background-color: #ff8844;
  color: black;
  font-weight: 600;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease;
}

#submit-button:hover {
  transform: scale(1.05);
  background-color: #ff7733;
}

/* Back button styling */
#backward {
  height: 2.125rem;
  width: 2.125rem;
  display: inline-block;
  margin-left: 1rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
  text-align: center;
}

#backward-icon {
  width: 2.125rem;
  height: 2.125rem;
  color: black;
  font-size: 1.5rem;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

#backward-icon:hover {
  transform: scale(1.1);
  opacity: 0.8;
}

/* Disabled state */
input:disabled, 
select:disabled {
  background-color: rgba(251, 240, 230, 0.5);
  cursor: not-allowed;
}

.back-link {
  height: 2.125rem;
  width: 2.125rem;
  display: inline-block;
  margin-left: 1rem;
  margin-top: 1rem;
  text-align: center;
}

.back-link i {
  width: 2.125rem;
  height: 2.125rem;
  color: black;
  font-size: 1.5rem;
}

.back-link i:hover {
  transform: scale(1.1);
  opacity: 0.8;
  cursor: pointer;
}

.placeholder-input {
  margin-left: 5.8125rem;
  width: 24.8125rem;
  height: 2rem;
  background-color: rgba(251, 240, 230, 0.5);
  letter-spacing: 0.42px;
  border-radius: 0.625rem;
  line-height: 2;
  border: none;
  box-sizing: border-box;
  color: #888;
  padding-left: 0.75rem;
  font-size: 0.875rem;
  cursor: not-allowed;
}
</style>