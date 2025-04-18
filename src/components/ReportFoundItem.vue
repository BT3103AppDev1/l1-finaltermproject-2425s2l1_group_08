<template>
  <div class="container">
    <form id="found-form">
      <h2 class="header">Report Found Item</h2>

      <div class="form-content">
        <!-- Navigation link back to home -->
        <RouterLink to="/" class="back-link">
          <i class="pi pi-arrow-left" aria-label="Go back"></i>
        </RouterLink>
        <br />

        <!-- Category selection dropdown -->
        <label for="category">Category</label><br />
        <select v-model="formData.category" id="category">
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
        <br /><br />

        <!-- Color selection dropdown -->
        <label for="color">Colour</label><br />
        <select v-model="formData.color" id="color" :disabled="formData.category === 'Student Card'" required>
          <option value="" disabled>
            {{ formData.category === 'Student Card' ? 'Colour not required for Student Cards' : '--Please choose the colour--' }}
          </option>
          <option value="Red">Red</option>
          <option value="Green">Green</option>
          <option value="Blue">Blue</option>
          <option value="Yellow">Yellow</option>
          <option value="Black">Black</option>
          <option value="White">White</option>
          <option value=" ">Others</option>
        </select>
        <br /><br />

        <!-- Brand input field -->
        <label for="brand">Brand</label><br />
        <input 
          type="text" 
          id="brand" 
          v-model="formData.brand" 
          required 
          :placeholder="formData.category === 'Student Card' ? 'Not required for student cards' : 'Enter Brand'" 
          :disabled="formData.category === 'Student Card'" 
        />
        <br /><br />

        <!-- Location input field -->
        <label for="location">Location Found</label><br />
        <input type="text" v-model="formData.location" id="location" required placeholder="Enter Location Found" />
        <br /><br />

        <!-- Date and time input -->
        <label for="datetime">Date & Time Found</label><br />
        <input 
          type="datetime-local" 
          v-model="formData.datetime" 
          id="datetime" 
          required 
          :max="maxDateTime" 
          placeholder="Enter Date & Time Lost" 
        />
        <br /><br />

        <!-- Description textarea -->
        <label for="description">Description</label><br />
        <textarea 
          id="description" 
          v-model="formData.description" 
          rows="5" 
          cols="20" 
          :placeholder="formData.category === 'Student Card' ? 'Enter name and student number on the card' : 'Enter Description'"
        ></textarea>
        <br /><br />

        <!-- Image upload section -->
        <label for="image-upload">Upload Image</label>
        <!-- Image preview if an image is selected -->
        <div v-if="imagePreview" class="image-preview-container">
          <button @click="removeImage" class="remove-image-btn" aria-label="Remove image">&#10006;</button>
          <img :src="imagePreview" alt="Uploaded Image" class="image-preview" />
        </div>
        <div class="upload-container">
          <input type="file" @change="handleFileUpload" id="image-upload" accept=".png,.jpg,.jpeg" />
          <label for="image-upload">
            <i class="pi pi-upload" id="upload-icon"></i>
            <span class="upload-instruction">{{ uploadInstructionText }}</span>
          </label>
          <br /><br />
        </div>

        <!-- Submit button -->
        <div class="submit-container">
          <button 
            class="submit-button" 
            type="button" 
            :disabled="uploading" 
            @click="saveFoundItem"
          >
            <span v-if="uploading">Submitting...</span>
            <span v-else>Submit</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script>
import { collection, addDoc, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useUserStore } from '@/stores/user-store';
import { storage, db } from '../firebase.js';
import { findMatchingLostItems } from '@/components/matchingService.js';

/**
 * @component ReportFoundItem
 * @description A form component for users to report found items. 
 * Allows users to input details about found items and upload images.
 */
export default {
  name: 'ReportFoundItem',
  
  data() {
    return {
      // Form data object containing all input fields
      formData: {
        category: '',
        color: '',
        brand: '',
        location: '',
        datetime: '',
        description: '',
        image: null,
      },
      // Maximum date time for the datetime input (current time)
      maxDateTime: new Date().toISOString().slice(0, 16),
      // URL for image preview
      imagePreview: null,
      // Text instructions for image upload
      uploadInstructionText: 'Please attach photo of the item',
      // Flag to indicate if form is currently being submitted
      uploading: false,
    };
  },

  methods: {
    /**
     * Handles file upload and creates an image preview
     * @param {Event} event - The file input change event
     */
    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        this.formData.image = file;
        this.imagePreview = URL.createObjectURL(file);
        this.uploadInstructionText = 'Reupload Image';
      }
    },

    /**
     * Removes the uploaded image and resets the file input
     */
    removeImage() {
      this.formData.image = null;
      this.imagePreview = null;
      this.uploadInstructionText = 'Please attach photo of the item';

      // Reset the file input value
      const fileInput = document.getElementById('image-upload');
      if (fileInput) {
        fileInput.value = '';
      }
    },

    /**
     * Saves the found item details to Firebase after validation
     */
    async saveFoundItem() {
      if (this.validateForm()) {
        const confirmed = confirm('Are you sure all details are correct? Found Items cannot be edited afterwards.');
        if (!confirmed) {
          return; // Exit if user cancels
        }

        try {
          this.uploading = true;
          let imageUrl = '';

          // Upload image if one is provided
          if (this.formData.image) {
            const imageFilePath = `found_items/${Date.now()}-${this.formData.image.name}`;
            const imageRef = ref(storage, imageFilePath);
            const snapshot = await uploadBytes(imageRef, this.formData.image);
            imageUrl = await getDownloadURL(snapshot.ref);
          }

          // Get user information
          const userStore = useUserStore();
          const userEmailRef = doc(db, 'users', userStore.userId);
          const docSnap = await getDoc(userEmailRef);
          const userData = docSnap.data();
          const userEmail = userData.email;

          // Prepare form data for matching algorithm
          const formForMatching = {
            category: this.formData.category,
            color: this.formData.color,
            brand: this.formData.brand,
            location: this.formData.location,
            datetime: this.formData.datetime,
            description: this.formData.description,
          };
          
          // Find matching lost items
          const matchingItems = await findMatchingLostItems(formForMatching);

          // Add document to "Found Item" collection
          const docRef = await addDoc(collection(db, 'Found Item'), {
            category: this.formData.category,
            colour: this.formData.color,
            brand: this.formData.brand,
            location: this.formData.location,
            date_time_found: this.formData.datetime,
            description: this.formData.description,
            name: this.formData.category === 'Student Card' 
              ? this.formData.category 
              : `${this.formData.color} ${this.formData.category}`,
            claimed_status: 'Not Found Yet',
            found_item_id: '',
            photo: imageUrl,
            photo_directory: this.formData.image ? `found_items/${Date.now()}-${this.formData.image.name}` : '',
            email: userEmail,
            reporter_id: userStore.userId,
            similar_item: matchingItems,
          });

          // Update the document with its own ID
          await updateDoc(docRef, {
            found_item_id: docRef.id,
          });

          // Update user's history with the new found item
          const userRef = doc(db, 'History', userStore.userId);
          await updateDoc(userRef, {
            found_item_id_list: arrayUnion(docRef.id),
          });

          // Reset form and show success message
          this.resetForm();
          alert('Item reported successfully!');
          this.uploading = false;
          this.$router.push('/');
          
        } catch (error) {
          console.error('Error saving item:', error);
          alert('Failed to report item. Please try again.');
          this.uploading = false;
        }
      }
    },

    /**
     * Validates the form data before submission
     * @returns {boolean} - Returns true if form is valid, false otherwise
     */
    validateForm() {
      const { category, color, brand, location, datetime, description, image } = this.formData;

      // Auto-fill some fields for Student Cards
      if (category === 'Student Card') {
        if (!this.formData.color) this.formData.color = 'Not Available';
        if (!this.formData.brand) this.formData.brand = 'Not Available';
      }

      // Check required fields
      if (!category || !location || !datetime || !description) {
        alert('Please fill all required fields.');
        return false;
      }

      // Check color and brand for non-Student Card items
      if (category !== 'Student Card' && (!color || !brand)) {
        alert('Please fill all required fields.');
        return false;
      }

      // Check if image is uploaded
      if (!image) {
        alert('Please upload an image of the found item.');
        return false;
      }

      // Validate datetime is in the past
      const selectedDateTime = new Date(datetime);
      const now = new Date();
      if (selectedDateTime > now) {
        alert('Date & Time must be in the past.');
        return false;
      }

      return true;
    },

    /**
     * Resets the form fields to their initial state
     */
    resetForm() {
      this.formData = {
        category: '',
        color: '',
        brand: '',
        location: '',
        datetime: '',
        description: '',
        image: null,
      };
      this.imagePreview = null;
      this.uploadInstructionText = 'Please attach photo of the item';
    },
  },
};
</script>

<style scoped>
/* Base styling */
* {
  font-family: 'Inter', sans-serif;
}

.container {
  margin-bottom: 2rem;
}

/* Page header */
.header {
  font-size: 3rem;
  color: #684545;
}

/* Form styling */
form {
  text-align: center;
  align-items: center;
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
}

/* Form elements styling */
.form-content label {
  margin-left: 5.8125rem;
  display: inline-block;
  width: 24.8125rem;
  height: 1.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.form-content input,
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

/* Placeholder text styling */
select,
input {
  color: #888;
  text-align: left;
}

textarea::placeholder {
  color: #888;
  font-size: 0.875rem;
  text-align: left;
}

/* Back button styling */
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
}

/* Image upload styling */
.image-preview-container {
  margin-bottom: 1rem;
}

.remove-image-btn {
  background: none;
  border: none;
  color: red;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.2rem;
  margin-left: 5.8125rem;
}

.image-preview {
  width: 50%;
  height: auto;
  margin-left: 9.1rem;
  margin-right: 9.1rem;
}

.upload-container {
  margin-left: 5.8125rem;
  width: 24.8125rem;
  background-color: rgba(251, 240, 230, 1);
  border-radius: 0.625rem;
  height: 2rem;
  display: flex;
  justify-content: start;
  position: relative;
  cursor: pointer;
}

.upload-container label {
  margin-left: 0;
  display: flex;
  align-items: center;
  justify-content: start;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

input[type='file'] {
  display: none;
}

.upload-container i {
  width: 1rem;
  height: 1rem;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  font-size: 1rem;
}

.upload-instruction {
  color: #888;
  font-size: 0.875rem;
}

/* Submit button styling */
.submit-container {
  text-align: center;
  margin-top: 1.5rem;
}

.submit-button {
  width: 5.5rem;
  height: 2rem;
  border-radius: 0.625rem;
  background-color: #ff8844;
  color: black;
  font-weight: 600;
  border: none;
  margin: 0.5rem 0;
  font-size: 1rem;
  cursor: pointer;
}

.submit-button:hover {
  transform: scale(1.1);
}

.submit-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
  color: #666;
}

.submit-button span {
  font-size: 0.75rem;
}
</style>